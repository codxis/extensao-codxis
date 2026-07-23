(function () {
  "use strict";

  const config = globalThis.AVANTE_CONFIG;
  if (!config || globalThis.__AVANTE_PAGE_BRIDGE_LISTENER__) return;
  globalThis.__AVANTE_PAGE_BRIDGE_LISTENER__ = true;

  const isCandidate = (url) =>
    config.api.urlIncludes.some((part) =>
      String(url || "").toLowerCase().includes(part.toLowerCase())
    );

  const publish = (url, payload) => {
    if (!isCandidate(url) || !payload || typeof payload !== "object") return;
    window.dispatchEvent(
      new CustomEvent("avante:data-response", {
        detail: JSON.stringify({
          url: String(url),
          payload,
          capturedAt: new Date().toISOString()
        })
      })
    );
  };

  const activate = () => {
    if (globalThis.__AVANTE_PAGE_BRIDGE__) return;
    globalThis.__AVANTE_PAGE_BRIDGE__ = true;

    const nativeFetch = window.fetch;
    if (nativeFetch) {
      window.fetch = async function (...args) {
        const response = await nativeFetch.apply(this, args);
        const url = response.url || args[0]?.url || args[0];
        if (isCandidate(url)) {
          response
            .clone()
            .json()
            .then((json) => publish(url, json))
            .catch(() => {});
        }
        return response;
      };
    }

    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__avanteUrl = url;
      return nativeOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      if (isCandidate(this.__avanteUrl)) {
        this.addEventListener(
          "load",
          () => {
            try {
              const json =
                this.responseType === "json"
                  ? this.response
                  : JSON.parse(this.responseText);
              publish(this.responseURL || this.__avanteUrl, json);
            } catch (_) {}
          },
          { once: true }
        );
      }
      return nativeSend.apply(this, args);
    };

    // Avisa o content script sobre navegações internas da SPA.
    const notifyRoute = (kind) =>
      window.dispatchEvent(
        new CustomEvent("avante:route-change", {
          detail: JSON.stringify({ kind, url: location.href, at: Date.now() })
        })
      );
    for (const method of ["pushState", "replaceState"]) {
      const nativeMethod = history[method];
      history[method] = function (...args) {
        const result = nativeMethod.apply(this, args);
        notifyRoute(method);
        return result;
      };
    }
    window.addEventListener("popstate", () => notifyRoute("popstate"));
    window.addEventListener("hashchange", () => notifyRoute("hashchange"));
  };

  window.addEventListener("avante:activate-bridge", activate, { once: true });
})();
