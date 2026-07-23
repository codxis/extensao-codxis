(function (root) {
  "use strict";

  const config = root.AVANTE_CONFIG;
  const storage = root.AvanteStorage;
  const STORAGE_KEYS = storage.KEYS;
  const goalCalculator = root.AvanteGoalCalculator;

  const money = new Intl.NumberFormat(config.app.locale, {
    style: "currency",
    currency: config.app.currency
  });

  const percentage = new Intl.NumberFormat(config.app.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  });

  class Dashboard {
    constructor() {
      this.host = null;
      this.root = null;
      this.passwordProtection = new root.AvantePasswordProtection(storage);
      this.salesHistory = new root.AvanteSalesHistory.SalesHistory(storage);
      this.miniChart = null;
      this.state = {
        goal: { amount: 0, period: "monthly" },
        snapshot: { sales: null, profit: null, capturedAt: null, source: null },
        salesHistory: [],
        collapsed: false,
        captureState: "unsynced",
        captureMessage: null
      };
      this.onStorageChanged = this.onStorageChanged.bind(this);
      chrome.storage.onChanged.addListener(this.onStorageChanged);
    }

    onStorageChanged(changes, areaName) {
      if (areaName !== "local") return;
      if (changes[STORAGE_KEYS.goal]) {
        this.state.goal = goalCalculator.normalizeMonthlyGoal(
          changes[STORAGE_KEYS.goal].newValue
        );
      }
      if (changes[STORAGE_KEYS.collapsed]) {
        this.state.collapsed = Boolean(
          changes[STORAGE_KEYS.collapsed].newValue
        );
      }
      if (changes[STORAGE_KEYS.salesHistory]) {
        this.state.salesHistory = root.AvanteSalesHistory.normalizeHistory(
          changes[STORAGE_KEYS.salesHistory].newValue,
          new Date()
        );
      }
      this.render();
    }

    async mount(host, fallback = false) {
      if (document.getElementById("avante-dashboard")) return;
      this.host = host;
      let stored = {};
      try {
        stored = await storage.get(Object.values(STORAGE_KEYS));
      } catch (error) {
        this.state.captureState = "storage-error";
        this.state.captureMessage = error.message;
      }
      const storedGoal = stored[STORAGE_KEYS.goal];
      this.state.goal = goalCalculator.normalizeMonthlyGoal(storedGoal);
      if (
        this.state.goal.amount > 0 &&
        (storedGoal?.period !== "monthly" ||
          storedGoal?.amount !== this.state.goal.amount)
      ) {
        storage.set({ [STORAGE_KEYS.goal]: this.state.goal }).catch(() => {});
      }
      if (!this.state.snapshot.capturedAt && stored[STORAGE_KEYS.snapshot]) {
        this.state.snapshot = stored[STORAGE_KEYS.snapshot];
        this.state.captureState = "cached";
      }
      this.state.collapsed = Boolean(stored[STORAGE_KEYS.collapsed]);
      try {
        this.state.salesHistory = await this.salesHistory.load();
      } catch (error) {
        this.state.captureState = "storage-error";
        this.state.captureMessage = error.message;
      }

      this.root = document.createElement("section");
      this.root.id = "avante-dashboard";
      this.root.className = fallback ? "avante-dashboard avante-floating" : "avante-dashboard";
      this.root.setAttribute("aria-label", "Dashboard de metas e resultados");
      this.root.innerHTML = this.template();
      fallback ? document.body.appendChild(this.root) : host.prepend(this.root);
      this.miniChart = new root.AvanteMiniChart.MiniChart(
        this.root.querySelector("[data-role=sales-chart]"),
        {
          money,
          percentage,
          locale: config.app.locale
        }
      );
      this.bind();
      this.render();
    }

    template() {
      return `
        <button type="button" class="avante-dashboard-launcher"
          data-action="reveal-dashboard" aria-label="Mostrar dashboard"
          title="Mostrar dashboard">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 19V9m6 10V5m6 14v-7m4 7H2"></path>
          </svg>
        </button>
        <header class="avante-header">
          <div>
            <span class="avante-eyebrow">CODXIS WEB</span>
            <h2>Meta e resultados</h2>
          </div>
          <div class="avante-actions">
            <span class="avante-status" data-role="status">Aguardando dados</span>
            <button type="button" class="avante-refresh" data-action="refresh"
              aria-label="Atualizar dados" title="Atualizar dados">↻ <span>Atualizar</span></button>
            <button type="button" class="avante-icon-button" data-action="collapse"
              aria-label="Recolher dashboard" aria-expanded="true">⌃</button>
            <button type="button" class="avante-icon-button avante-close"
              data-action="close-dashboard" aria-label="Fechar dashboard"
              title="Fechar dashboard">×</button>
          </div>
        </header>
        <div class="avante-body" data-role="body">
          <div class="avante-goal-card">
            <div class="avante-goal-heading">
              <div>
                <span class="avante-label">PROGRESSO DA META MENSAL</span>
                <strong class="avante-percent" data-role="percent">0%</strong>
              </div>
              <button type="button" class="avante-edit" data-action="edit">Definir meta</button>
              <button type="button" class="avante-change-password"
                data-action="change-password">Alterar senha</button>
            </div>
            <div class="avante-progress" role="progressbar" aria-valuemin="0"
              aria-valuemax="100" aria-valuenow="0">
              <span data-role="progress"></span>
            </div>
            <p class="avante-explanation" data-role="explanation">Defina uma meta para começar.</p>
            <div class="avante-goal-numbers">
              <div><span>Vendido no mês</span><strong data-role="sales">—</strong></div>
              <div><span>Meta mensal</span><strong data-role="goal">—</strong></div>
              <div><span>Valor restante</span><strong data-role="remaining">—</strong></div>
            </div>
            <div class="avante-required-metrics">
              <div>
                <span>Dias restantes no mês</span>
                <strong data-role="days">—</strong>
              </div>
              <div>
                <span>Média diária necessária</span>
                <strong data-role="daily">—</strong>
              </div>
              <div>
                <span data-role="weekly-label">Meta para os próximos 7 dias</span>
                <strong data-role="weekly">—</strong>
              </div>
            </div>
            <section class="avante-sales-chart" data-role="sales-chart"
              aria-labelledby="avante-sales-chart-title">
              <div class="avante-chart-heading">
                <div>
                  <span class="avante-label">HISTÓRICO LOCAL</span>
                  <h3 id="avante-sales-chart-title">Evolução das vendas no mês</h3>
                </div>
                <span class="avante-chart-legend">— Meta mensal</span>
              </div>
              <div class="avante-chart-canvas">
                <svg role="group" aria-label="Gráfico da evolução das vendas"
                  preserveAspectRatio="xMidYMid meet"></svg>
                <div class="avante-chart-tooltip" data-role="chart-tooltip"
                  role="tooltip" hidden></div>
              </div>
              <p class="avante-chart-empty" data-role="chart-empty">
                Nenhum dado registrado neste mês.
              </p>
              <p class="avante-chart-hint" data-role="chart-hint" hidden>
                Registrando a evolução. O gráfico será formado conforme novos
                dados forem capturados.
              </p>
            </section>
            <div class="avante-surplus" data-role="surplus-card" hidden>
              <div>
                <span>SUPERÁVIT</span>
                <strong data-role="surplus">—</strong>
              </div>
              <p>Você ultrapassou a meta em <strong data-role="above-goal">—</strong>.</p>
            </div>
          </div>
          <div class="avante-metric-card avante-profit">
            <span class="avante-metric-icon" aria-hidden="true">↗</span>
            <div>
              <span class="avante-label">LUCRO REAL</span>
              <strong data-role="profit">—</strong>
              <small>Valor informado pelo sistema</small>
              <small class="avante-updated" data-role="updated">Ainda não sincronizado</small>
            </div>
          </div>
          <form class="avante-form" data-role="form" hidden>
            <label>Meta mensal
              <span class="avante-money-input"><span>R$</span>
                <input name="amount" inputmode="decimal" placeholder="10.000,00" required>
              </span>
            </label>
            <div class="avante-form-actions">
              <button type="button" data-action="cancel">Cancelar</button>
              <button type="submit">Salvar meta</button>
            </div>
          </form>
        </div>
        <div class="avante-password-modal" data-role="password-modal" hidden>
          <div class="avante-password-backdrop" data-action="close-password"></div>
          <div class="avante-password-dialog" role="dialog" aria-modal="true"
            aria-labelledby="avante-password-title">
            <form data-role="password-form">
              <h3 id="avante-password-title" data-role="password-title">Acesso à meta</h3>
              <p class="avante-password-description" data-role="password-description"></p>
              <label data-field="current" hidden>Senha atual
                <input name="currentPassword" type="password" autocomplete="current-password">
              </label>
              <label data-field="password">Senha
                <input name="password" type="password" autocomplete="current-password" required>
              </label>
              <label data-field="confirm" hidden>Confirmar senha
                <input name="confirmation" type="password" autocomplete="new-password">
              </label>
              <label class="avante-show-password">
                <input name="showPassword" type="checkbox">
                Mostrar senha
              </label>
              <p class="avante-password-error" data-role="password-error"
                role="alert" aria-live="assertive"></p>
              <p class="avante-password-help">
                A senha é armazenada somente neste navegador. Caso seja perdida,
                será necessário redefinir manualmente pela extensão.
              </p>
              <div class="avante-password-actions">
                <button type="button" data-action="close-password">Cancelar</button>
                <button type="submit" data-role="password-submit">Entrar</button>
              </div>
            </form>
          </div>
        </div>`;
    }

    bind() {
      this.root.addEventListener("click", (event) => {
        const action = event.target.closest("[data-action]")?.dataset.action;
        if (action === "edit") this.requestGoalAccess();
        if (action === "change-password") this.openPasswordModal("change");
        if (action === "cancel") this.closeForm();
        if (action === "close-password") this.closePasswordModal();
        if (action === "collapse") this.toggleCollapsed();
        if (action === "close-dashboard") this.closeDashboard();
        if (action === "reveal-dashboard") this.revealDashboard();
        if (action === "refresh") {
          this.setCaptureStatus({ state: "syncing", reason: "manual" });
          this.root.dispatchEvent(new CustomEvent("avante:manual-refresh"));
        }
      });
      this.root.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const amount = this.parseInput(form.get("amount"));
        if (!(amount > 0)) return;
        this.state.goal = { amount, period: "monthly" };
        storage.set({ [STORAGE_KEYS.goal]: this.state.goal }).catch(() => {});
        this.closeForm();
        this.render();
      });
      const passwordForm = this.root.querySelector(
        "[data-role=password-form]"
      );
      passwordForm.addEventListener("submit", (event) =>
        this.handlePasswordSubmit(event)
      );
      passwordForm.elements.showPassword.addEventListener("change", (event) => {
        const type = event.currentTarget.checked ? "text" : "password";
        passwordForm
          .querySelectorAll("input[type=password], input[type=text]")
          .forEach((input) => {
            if (input.name !== "showPassword") input.type = type;
          });
      });
    }

    closeDashboard() {
      this.closeForm();
      this.root.classList.add("is-closed");
      this.root
        .querySelector("[data-action=reveal-dashboard]")
        .focus({ preventScroll: true });
    }

    revealDashboard() {
      this.root.classList.remove("is-closed");
      this.root
        .querySelector("[data-action=close-dashboard]")
        .focus({ preventScroll: true });
    }

    async requestGoalAccess() {
      try {
        const mode = (await this.passwordProtection.hasPassword())
          ? "login"
          : "setup";
        this.openPasswordModal(mode);
      } catch (error) {
        this.setCaptureStatus({
          state: "storage-error",
          message: error.message
        });
      }
    }

    openPasswordModal(mode) {
      const modal = this.root.querySelector("[data-role=password-modal]");
      const form = modal.querySelector("form");
      const currentField = form.querySelector("[data-field=current]");
      const passwordField = form.querySelector("[data-field=password]");
      const confirmField = form.querySelector("[data-field=confirm]");
      const passwordInput = form.elements.password;
      const modes = {
        login: {
          title: "Editar meta mensal",
          description: "Digite a senha para liberar a edição da meta.",
          passwordLabel: "Senha",
          submit: "Entrar",
          current: false,
          confirm: false
        },
        setup: {
          title: "Proteja sua meta",
          description: "Cadastre uma senha com pelo menos 4 caracteres.",
          passwordLabel: "Nova senha",
          submit: "Salvar",
          current: false,
          confirm: true
        },
        change: {
          title: "Alterar senha",
          description: "Confirme a senha atual antes de definir uma nova.",
          passwordLabel: "Nova senha",
          submit: "Alterar senha",
          current: true,
          confirm: true
        }
      };
      const settings = modes[mode];
      form.reset();
      form.dataset.mode = mode;
      currentField.hidden = !settings.current;
      currentField.querySelector("input").required = settings.current;
      confirmField.hidden = !settings.confirm;
      confirmField.querySelector("input").required = settings.confirm;
      passwordInput.autocomplete =
        mode === "login" ? "current-password" : "new-password";
      passwordField.firstChild.textContent = settings.passwordLabel;
      this.setText("password-title", settings.title);
      this.setText("password-description", settings.description);
      this.setText("password-submit", settings.submit);
      this.setText("password-error", "");
      modal.hidden = false;
      window.setTimeout(
        () =>
          (settings.current
            ? form.elements.currentPassword
            : passwordInput
          ).focus(),
        0
      );
    }

    closePasswordModal() {
      const modal = this.root.querySelector("[data-role=password-modal]");
      modal.hidden = true;
      modal.querySelector("form").reset();
      this.setText("password-error", "");
    }

    async handlePasswordSubmit(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector("[type=submit]");
      const mode = form.dataset.mode;
      const password = form.elements.password.value;
      const confirmation = form.elements.confirmation.value;
      const currentPassword = form.elements.currentPassword.value;

      if (mode !== "login" && password.length < 4) {
        this.setText("password-error", "A senha deve possuir no mínimo 4 caracteres.");
        return;
      }
      if (mode !== "login" && password !== confirmation) {
        this.setText("password-error", "As senhas são diferentes.");
        return;
      }

      submit.disabled = true;
      this.setText("password-error", "");
      try {
        const result =
          mode === "setup"
            ? await this.passwordProtection.createPassword(password)
            : mode === "change"
              ? await this.passwordProtection.changePassword(
                  currentPassword,
                  password
                )
              : await this.passwordProtection.verifyPassword(password);

        if (!result.ok) {
          const messages = {
            blocked: "Muitas tentativas. Aguarde 5 minutos.",
            incorrect:
              mode === "change" ? "Senha atual incorreta." : "Senha incorreta.",
            "too-short": "A senha deve possuir no mínimo 4 caracteres.",
            "already-configured": "Uma senha já foi cadastrada.",
            "not-configured": "Nenhuma senha foi cadastrada."
          };
          this.setText(
            "password-error",
            messages[result.reason] || "Não foi possível validar a senha."
          );
          return;
        }

        this.closePasswordModal();
        if (mode === "login" || mode === "setup") this.openForm();
      } catch (error) {
        this.setText(
          "password-error",
          `Não foi possível acessar o armazenamento: ${error.message}`
        );
      } finally {
        submit.disabled = false;
      }
    }

    parseInput(value) {
      let text = String(value || "").replace(/[^\d,.-]/g, "");
      if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
      return Number(text);
    }

    openForm() {
      const form = this.root.querySelector("[data-role=form]");
      form.hidden = false;
      form.elements.amount.value = this.state.goal.amount
        ? this.state.goal.amount.toLocaleString(config.app.locale, {
            minimumFractionDigits: 2
          })
        : "";
      form.elements.amount.focus();
    }

    closeForm() {
      this.root.querySelector("[data-role=form]").hidden = true;
    }

    toggleCollapsed() {
      this.state.collapsed = !this.state.collapsed;
      storage.set({ [STORAGE_KEYS.collapsed]: this.state.collapsed }).catch(() => {});
      this.render();
    }

    async updateSnapshot(snapshot) {
      const previous = this.state.snapshot;
      const previousAge = previous.capturedAt
        ? Date.now() - new Date(previous.capturedAt).getTime()
        : Infinity;
      const priorities = config.capture.sourcePriority;
      const incomingPriority = priorities[snapshot.source] ?? 0;
      const previousPriority = priorities[previous.source] ?? 0;
      if (
        previousAge < config.capture.staleAfterMs &&
        incomingPriority < previousPriority
      ) {
        return;
      }

      this.state.snapshot = {
        ...previous,
        ...Object.fromEntries(
          Object.entries(snapshot).filter(([, value]) => value != null)
        )
      };
      this.state.captureState = snapshot.state || "valid";
      this.state.captureMessage = null;
      const validMonthlyDomSale =
        snapshot.source === "DOM" &&
        snapshot.salesOrigin === "DOM_SELECTOR" &&
        Number.isFinite(snapshot.sales) &&
        snapshot.sales >= 0 &&
        (!snapshot.period || snapshot.period === "monthly") &&
        (snapshot.state === "valid" || snapshot.state === "no-sales");
      if (validMonthlyDomSale) {
        try {
          this.state.salesHistory = await this.salesHistory.record(
            snapshot.sales,
            new Date()
          );
        } catch (error) {
          this.state.captureState = "storage-error";
          this.state.captureMessage = error.message;
        }
      }
      await storage
        .set({ [STORAGE_KEYS.snapshot]: this.state.snapshot })
        .catch(() => this.setCaptureStatus({ state: "storage-error" }));
      this.render();
    }

    setCaptureStatus(detail) {
      // Um erro novo não apaga o último retrato válido; apenas sinaliza o estado.
      this.state.captureState = detail.state;
      this.state.captureMessage = detail.message || null;
      this.render();
    }

    setText(role, value) {
      this.root.querySelector(`[data-role=${role}]`).textContent = value;
    }

    render() {
      if (!this.root) return;
      const { goal, snapshot, collapsed, salesHistory } = this.state;
      const hasSales = Number.isFinite(snapshot.sales);
      const hasProfit = Number.isFinite(snapshot.profit);
      const hasGoal = goal.amount > 0;
      const periodMatches = !snapshot.period || snapshot.period === "monthly";
      const usableSales = hasSales && periodMatches;
      const metrics =
        hasGoal && usableSales
          ? goalCalculator.calculateMonthlyGoalMetrics(
              goal.amount,
              snapshot.sales,
              new Date()
            )
          : null;
      const percent = metrics?.progress || 0;
      const isCompleted = Boolean(metrics && snapshot.sales === goal.amount);
      const hasSurplus = Boolean(metrics && metrics.surplus > 0);
      const stateLabels = {
        unsynced: "Dados ainda não sincronizados",
        cached: "Cache local",
        syncing: "Atualizando…",
        "no-sales": "Sem vendas no período",
        valid: snapshot.source || "Sincronizado",
        "not-configured": "Captura aguardando configuração",
        "not-found": "Dados não encontrados nesta tela",
        "invalid-selector": "Seletor inválido",
        "capture-error": "Erro de captura",
        "storage-error": "Erro ao salvar cache"
      };

      this.root.classList.toggle("is-collapsed", collapsed);
      const goalCard = this.root.querySelector(".avante-goal-card");
      goalCard.classList.toggle("avante-goal--completed", isCompleted);
      goalCard.classList.toggle("avante-goal--surplus", hasSurplus);
      const collapseButton = this.root.querySelector("[data-action=collapse]");
      collapseButton.textContent = collapsed ? "⌄" : "⌃";
      collapseButton.setAttribute("aria-expanded", String(!collapsed));
      collapseButton.setAttribute("aria-label", collapsed ? "Expandir dashboard" : "Recolher dashboard");

      this.setText(
        "sales",
        usableSales
          ? money.format(snapshot.sales)
          : hasSales
            ? "Período diferente"
            : "Aguardando"
      );
      this.setText("profit", hasProfit ? money.format(snapshot.profit) : "Aguardando");
      this.setText("goal", hasGoal ? money.format(goal.amount) : "Não definida");
      this.setText(
        "remaining",
        metrics ? money.format(metrics.remainingAmount) : "—"
      );
      this.setText("percent", `${percentage.format(percent)}%`);
      this.setText(
        "days",
        metrics
          ? `${metrics.remainingDays} ${metrics.remainingDays === 1 ? "dia" : "dias"}`
          : "—"
      );
      this.setText(
        "daily",
        metrics ? money.format(metrics.dailyRequired) : "—"
      );
      this.setText(
        "weekly-label",
        metrics && metrics.windowDays < 7
          ? `Meta para os últimos ${metrics.windowDays} ${metrics.windowDays === 1 ? "dia" : "dias"} do mês`
          : "Meta para os próximos 7 dias"
      );
      this.setText(
        "weekly",
        metrics ? money.format(metrics.weeklyRequired) : "—"
      );
      const surplusCard = this.root.querySelector("[data-role=surplus-card]");
      surplusCard.hidden = !hasSurplus;
      this.setText(
        "surplus",
        hasSurplus ? money.format(metrics.surplus) : "—"
      );
      this.setText(
        "above-goal",
        hasSurplus ? `${percentage.format(metrics.aboveGoalPercentage)}%` : "—"
      );
      this.setText(
        "explanation",
        !hasGoal
          ? "Defina sua meta mensal para começar."
          : !hasSales
            ? "Abra uma tela de vendas ou fechamento para sincronizar os valores."
            : !periodMatches
              ? "O sistema exibiu dados de outro período. Selecione o período mensal no Codxis."
              : hasSurplus
                ? `Parabéns! Você ultrapassou sua meta mensal. Superávit de ${money.format(metrics.surplus)}.`
                : isCompleted
                  ? "Meta mensal atingida! Parabéns! Você alcançou 100% da meta deste mês."
                  : `Faltam ${money.format(metrics.remainingAmount)} para atingir a meta mensal. Você precisa vender em média ${money.format(metrics.dailyRequired)} por dia nos próximos ${metrics.remainingDays} ${metrics.remainingDays === 1 ? "dia" : "dias"}.`
      );
      this.setText(
        "status",
        stateLabels[this.state.captureState] || "Aguardando dados"
      );
      this.root.querySelector("[data-role=status]").title =
        this.state.captureMessage || "";
      this.setText(
        "updated",
        snapshot.capturedAt
          ? `Atualizado em ${new Date(snapshot.capturedAt).toLocaleString(
              config.app.locale,
              {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              }
            )}`
          : "Ainda não sincronizado"
      );

      const bar = this.root.querySelector(".avante-progress");
      bar.setAttribute("aria-valuenow", String(Math.min(percent, 100).toFixed(0)));
      bar.querySelector("span").style.width = `${Math.min(percent, 100)}%`;
      this.root.querySelector("[data-action=edit]").textContent = hasGoal
        ? "Editar meta"
        : "Definir meta";
      this.root
        .querySelector(".avante-chart-legend")
        .toggleAttribute("hidden", !hasGoal);
      const currentMonthHistory = root.AvanteSalesHistory.normalizeHistory(
        salesHistory,
        new Date()
      );
      this.miniChart?.render(
        currentMonthHistory,
        hasGoal ? goal.amount : null
      );
    }
  }

  root.AvanteDashboard = Dashboard;
})(globalThis);
