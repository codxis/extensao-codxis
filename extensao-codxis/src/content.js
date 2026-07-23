(function () {
  "use strict";

  const config = globalThis.AVANTE_CONFIG;
  let dashboard;
  let collector;
  let started = false;
  let visibilityQueued = false;
  const diagnosticsEnabled = () =>
    config.app.diagnostics || globalThis.__AVANTE_DIAGNOSTICS__;

  const normalize = (text) =>
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const isAllowedApp = () => {
    if (config.app.allowedHosts.length) {
      return config.app.allowedHosts.some(
        (host) =>
          location.hostname === host || location.hostname.endsWith(`.${host}`)
      );
    }
    const sample = `${document.title} ${document.body?.innerText?.slice(0, 5000)}`;
    return config.app.titleHints.some((hint) =>
      normalize(sample).includes(normalize(hint))
    );
  };

  function matchesAnySelector(selectors) {
    return selectors.some((selector) => {
      try {
        return Boolean(document.querySelector(selector));
      } catch (error) {
        if (diagnosticsEnabled()) {
          console.warn("[CODXIS WEB] Seletor exclusivo inválido", selector, error);
        }
        return false;
      }
    });
  }

  function textFromSelectors(selectors) {
    return selectors
      .flatMap((selector) => {
        try {
          return Array.from(document.querySelectorAll(selector), (element) =>
            normalize(element.textContent)
          );
        } catch (_) {
          return [];
        }
      })
      .join(" ");
  }

  /**
   * Retorna true somente com evidência forte da home:
   * - um seletor exclusivo configurado; ou
   * - todos os textos de ao menos um grupo exclusivo de indicadores.
   *
   * URL, breadcrumb e título são evidências auxiliares e nunca identificam a
   * home sozinhos, evitando falso positivo em telas internas.
   */
  function isHomePage() {
    const bodyText = normalize(document.body?.innerText || "");
    const matchedTextGroup = config.mount.homeTextEvidenceGroups.find(
      (group) =>
        group.length > 0 &&
        group.every((text) => bodyText.includes(normalize(text)))
    );
    const hasExclusiveTextGroup = Boolean(matchedTextGroup);
    const hasExclusiveSelector = matchesAnySelector(
      config.mount.homeExclusiveSelectors
    );

    if (!hasExclusiveTextGroup && !hasExclusiveSelector) return false;

    const breadcrumbText = textFromSelectors(config.mount.breadcrumbSelectors);
    const titleText = textFromSelectors(config.mount.titleSelectors);
    const route = normalize(`${location.pathname}${location.hash}`);
    const hasSupportingEvidence =
      config.mount.homeBreadcrumbWords.some((word) =>
        breadcrumbText.includes(normalize(word))
      ) ||
      config.mount.homeTitleWords.some((word) =>
        titleText.includes(normalize(word))
      ) ||
      config.mount.routeHints.some((hint) => route.includes(normalize(hint)));

    // Um grupo completo de indicadores exclusivos forma uma combinação forte.
    // URL, breadcrumb e título permanecem apenas como apoio de diagnóstico.
    if (diagnosticsEnabled()) {
      console.debug("[CODXIS WEB] Verificação da home", {
        hasExclusiveTextGroup,
        matchedTextGroup,
        hasExclusiveSelector,
        hasSupportingEvidence,
        route
      });
    }
    return hasExclusiveTextGroup || hasExclusiveSelector;
  };

  const findHost = () => {
    for (const selector of config.mount.homeContainers) {
      try {
        const element = document.querySelector(selector);
        if (element) return element;
      } catch (error) {
        if (diagnosticsEnabled()) {
          console.warn("[CODXIS WEB] Seletor de montagem inválido", selector, error);
        }
      }
    }
    return null;
  };

  const mountDashboard = async () => {
    if (!started || document.getElementById("avante-dashboard")) return;
    const host = findHost();
    await dashboard.mount(host || document.body, !host);
    dashboard.root.addEventListener("avante:manual-refresh", () =>
      collector.refresh("manual")
    );
  };

  const removeDashboard = () => {
    const element = document.getElementById("avante-dashboard");
    if (element) element.remove();
    if (dashboard) dashboard.root = null;
  };

  async function syncDashboardVisibility() {
    if (!started) return;
    if (isHomePage()) {
      await mountDashboard();
    } else {
      // Remover do DOM garante ausência de margem, altura e sobreposição.
      removeDashboard();
    }
  }

  const queueVisibilitySync = () => {
    if (visibilityQueued) return;
    visibilityQueued = true;
    window.setTimeout(() => {
      visibilityQueued = false;
      syncDashboardVisibility();
    }, 100);
  };

  const onRouteChange = () => {
    // A rota mudou: remove imediatamente antes mesmo da nova tela renderizar.
    removeDashboard();
    collector?.refresh("route-change");
    window.setTimeout(queueVisibilitySync, 100);
  };

  const start = async () => {
    if (started || !isAllowedApp()) return;
    started = true;
    try {
      const values = await globalThis.AvanteStorage.get([
        globalThis.AvanteStorage.KEYS.diagnostics
      ]);
      globalThis.__AVANTE_DIAGNOSTICS__ = Boolean(
        values[globalThis.AvanteStorage.KEYS.diagnostics]
      );
    } catch (_) {
      globalThis.__AVANTE_DIAGNOSTICS__ = false;
    }
    window.dispatchEvent(new CustomEvent("avante:activate-bridge"));

    dashboard = new globalThis.AvanteDashboard();
    collector = new globalThis.AvanteDataCollector();
    collector.addEventListener("data", (event) =>
      dashboard.updateSnapshot(event.detail)
    );
    collector.addEventListener("status", (event) =>
      dashboard.setCaptureStatus(event.detail)
    );
    collector.start();

    window.addEventListener("avante:route-change", onRouteChange);
    window.addEventListener("pageshow", onRouteChange);
    window.addEventListener("focus", () => collector.refresh("focus"));
    await syncDashboardVisibility();
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "AVANTE_REFRESH") {
      if (!started || !collector) {
        sendResponse({
          ok: false,
          message: "A página atual não foi reconhecida como Codxis."
        });
        return;
      }
      collector.refresh("popup");
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "AVANTE_REVEAL") {
      if (!started || !isHomePage()) {
        sendResponse({
          ok: false,
          message: "Navegue até a home do Codxis para mostrar o dashboard."
        });
        return;
      }
      syncDashboardVisibility().then(() => {
        const panel = document.getElementById("avante-dashboard");
        panel?.scrollIntoView({ behavior: "smooth", block: "start" });
        sendResponse({ ok: Boolean(panel) });
      });
      return true;
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    const key = globalThis.AvanteStorage.KEYS.diagnostics;
    if (areaName === "local" && changes[key]) {
      globalThis.__AVANTE_DIAGNOSTICS__ = Boolean(changes[key].newValue);
    }
  });

  start();

  // Observa tanto a inicialização tardia quanto retornos à home em aplicações SPA.
  const appObserver = new MutationObserver((mutations) => {
    const externalChange = mutations.some((mutation) => {
      const element =
        mutation.target instanceof Element
          ? mutation.target
          : mutation.target.parentElement;
      return !element?.closest("#avante-dashboard");
    });
    if (!externalChange) return;
    if (!started) start();
    else queueVisibilitySync();
  });
  appObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
