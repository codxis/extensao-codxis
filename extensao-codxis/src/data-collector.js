(function (root) {
  "use strict";

  const config = root.AVANTE_CONFIG;
  const debug = (...args) => {
    if (config.app.diagnostics || root.__AVANTE_DIAGNOSTICS__) {
      console.debug("[CODXIS WEB]", ...args);
    }
  };

  const parseMoney = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (value == null) return null;
    let text = String(value).trim().replace(/[^\d,.-]/g, "");
    if (!text) return null;
    if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const moneyMatches = (text) =>
    Array.from(
      String(text || "").matchAll(/R\$\s*-?\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})|R\$\s*-?\s*\d+(?:[.,]\d{2})?/gi),
      (match) => match[0]
    );

  const inferPeriod = (text) => {
    const normalized = normalize(text);
    for (const [period, words] of Object.entries(config.semantic.periodWords)) {
      if (words.some((word) => normalized.includes(normalize(word)))) return period;
    }
    return null;
  };

  const firstElement = (selectors, scope = document) => {
    for (const selector of selectors || []) {
      try {
        const element = scope.querySelector(selector);
        if (element) return element;
      } catch (error) {
        throw new Error(`Seletor CSS inválido: ${selector}`, { cause: error });
      }
    }
    return null;
  };

  const readElement = (selectors, scope) => {
    const element = firstElement(selectors, scope);
    return element
      ? element.getAttribute("data-value") || element.value || element.textContent
      : null;
  };

  const valueAtPath = (object, path) =>
    path.split(".").reduce((value, key) => value?.[key], object);

  const firstPathValue = (payload, paths) => {
    for (const path of paths) {
      const value = valueAtPath(payload, path);
      if (value !== undefined && value !== null) return value;
    }
    return null;
  };

  class DataCollector extends EventTarget {
    constructor() {
      super();
      this.lastSignature = "";
      this.observer = null;
      this.timer = null;
      this.scanQueued = false;
      this.onApiResponse = this.onApiResponse.bind(this);
      this.lastError = null;
    }

    start() {
      window.addEventListener("avante:data-response", this.onApiResponse);
      this.observer = new MutationObserver((mutations) => {
        const externalChange = mutations.some((mutation) => {
          const element =
            mutation.target instanceof Element
              ? mutation.target
              : mutation.target.parentElement;
          return !element?.closest("#avante-dashboard");
        });
        if (externalChange) this.queueScan();
      });
      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
      this.timer = window.setInterval(() => this.scanDom(), config.app.refreshMs);
      this.scanDom();
    }

    stop() {
      window.removeEventListener("avante:data-response", this.onApiResponse);
      this.observer?.disconnect();
      window.clearInterval(this.timer);
    }

    queueScan() {
      if (this.scanQueued) return;
      this.scanQueued = true;
      window.setTimeout(() => {
        this.scanQueued = false;
        this.scanDom();
      }, 350);
    }

    refresh(reason = "manual") {
      this.dispatchEvent(
        new CustomEvent("status", { detail: { state: "syncing", reason } })
      );
      this.scanDom(reason);
    }

    scanDom(reason = "automatic") {
      try {
        this.scanStructured(reason);
        const rows = [];
        for (const selector of config.dom.transactionRows) {
          try {
            document.querySelectorAll(selector).forEach((row) => rows.push(row));
          } catch (error) {
            throw new Error(`Seletor CSS inválido: ${selector}`, { cause: error });
          }
        }

        const directSales = parseMoney(readElement(config.dom.salesTotal));
        let sales = directSales;
        let profit = parseMoney(readElement(config.dom.profitTotal));
        let semanticPeriod = null;
        let salesOrigin = directSales != null ? "DOM_SELECTOR" : null;

        if (sales == null || profit == null) {
          const semantic = this.scanSemantic();
          if (sales == null) {
            sales = semantic.sales;
            if (sales != null) salesOrigin = "SEMANTIC";
          }
          if (profit == null) profit = semantic.profit;
          semanticPeriod = semantic.period;
        }

        if (sales == null && rows.length) {
          const values = rows
            .map((row) => parseMoney(readElement(config.dom.row.amount, row)))
            .filter((value) => value != null);
          if (values.length) {
            sales = values.reduce((sum, value) => sum + value, 0);
            salesOrigin = "DOM_ROWS";
          }
        }
        if (profit == null && rows.length) {
          const values = rows
            .map((row) => parseMoney(readElement(config.dom.row.profit, row)))
            .filter((value) => value != null);
          if (values.length) profit = values.reduce((sum, value) => sum + value, 0);
        }

        const configured =
          config.dom.salesTotal.length > 0 ||
          config.dom.profitTotal.length > 0 ||
          config.dom.transactionRows.length > 0 ||
          config.semantic.salesLabels.length > 0 ||
          config.semantic.profitLabels.length > 0;
        if (sales == null && profit == null) {
          this.dispatchEvent(
            new CustomEvent("status", {
              detail: {
                state: configured ? "not-found" : "not-configured",
                reason
              }
            })
          );
          return;
        }

        this.lastError = null;
        this.publish({
          sales,
          salesOrigin,
          profit,
          periodLabel: readElement(config.dom.periodLabel)?.trim() || null,
          period: semanticPeriod,
          capturedAt: new Date().toISOString(),
          source: "DOM",
          state: sales === 0 ? "no-sales" : "valid"
        });
      } catch (error) {
        this.lastError = error;
        const invalidSelector = error.message.startsWith("Seletor CSS inválido:");
        debug("Falha na captura DOM", error);
        this.dispatchEvent(
          new CustomEvent("status", {
            detail: {
              state: invalidSelector ? "invalid-selector" : "capture-error",
              message: error.message,
              reason
            }
          })
        );
      }
    }

    scanSemantic() {
      const result = { sales: null, profit: null, period: null };
      const labels = [
        ...config.semantic.salesLabels.map((label) => ({
          kind: "sales",
          label: normalize(label)
        })),
        ...config.semantic.profitLabels.map((label) => ({
          kind: "profit",
          label: normalize(label)
        }))
      ];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const parent = node.parentElement;
            if (
              !parent ||
              parent.closest("#avante-dashboard") ||
              ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)
            ) {
              return NodeFilter.FILTER_REJECT;
            }
            const text = normalize(node.nodeValue);
            return labels.some(({ label }) => text.includes(label))
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
        }
      );

      let node;
      while ((node = walker.nextNode())) {
        const labelText = normalize(node.nodeValue);
        const candidates = labels.filter(({ label }) => labelText.includes(label));
        for (const { kind } of candidates) {
          if (result[kind] != null) continue;
          let container = node.parentElement;
          for (
            let level = 0;
            container && level <= config.semantic.maxAncestorLevels;
            level += 1, container = container.parentElement
          ) {
            if (container.closest("#avante-dashboard")) break;
            const text = container.innerText || container.textContent || "";
            if (text.length > config.semantic.maxContainerTextLength) break;
            const values = moneyMatches(text);
            if (!values.length) continue;
            result[kind] = parseMoney(values[0]);
            result.period ||= inferPeriod(`${node.nodeValue} ${text}`);
            debug("Valor semântico reconhecido", {
              kind,
              label: node.nodeValue.trim(),
              value: result[kind],
              period: result.period
            });
            break;
          }
        }
        if (result.sales != null && result.profit != null) break;
      }
      return result;
    }

    scanStructured(reason) {
      for (const selector of config.structured.jsonContainers) {
        let elements;
        try {
          elements = document.querySelectorAll(selector);
        } catch (error) {
          throw new Error(`Seletor CSS inválido: ${selector}`, { cause: error });
        }
        for (const element of elements) {
          try {
            const payload = JSON.parse(element.textContent);
            const sales = parseMoney(
              firstPathValue(payload, config.structured.salesPaths)
            );
            const profit = parseMoney(
              firstPathValue(payload, config.structured.profitPaths)
            );
            if (sales == null && profit == null) continue;
            this.publish({
              sales,
              profit,
              capturedAt:
                firstPathValue(payload, config.structured.datePaths) ||
                new Date().toISOString(),
              source: "STRUCTURED",
              state: sales === 0 ? "no-sales" : "valid",
              reason
            });
            return;
          } catch (error) {
            debug("JSON estruturado ignorado", selector, error);
          }
        }
      }
    }

    onApiResponse(event) {
      try {
        const { payload, capturedAt } = JSON.parse(event.detail);
        this.publish({
          sales: parseMoney(firstPathValue(payload, config.api.salesPaths)),
          profit: parseMoney(firstPathValue(payload, config.api.profitPaths)),
          capturedAt:
            firstPathValue(payload, config.api.datePaths) || capturedAt,
          source: "API",
          state:
            parseMoney(firstPathValue(payload, config.api.salesPaths)) === 0
              ? "no-sales"
              : "valid"
        });
      } catch (error) {
        debug("Falha ao interpretar resposta de API", error);
        this.dispatchEvent(
          new CustomEvent("status", {
            detail: { state: "capture-error", message: error.message }
          })
        );
      }
    }

    publish(data) {
      if (data.sales == null && data.profit == null) return;
      const signature = JSON.stringify(data);
      if (signature === this.lastSignature) return;
      this.lastSignature = signature;
      debug("Captura válida", data);
      this.dispatchEvent(new CustomEvent("data", { detail: data }));
    }
  }

  root.AvanteDataCollector = DataCollector;
})(globalThis);
