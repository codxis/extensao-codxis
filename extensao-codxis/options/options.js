"use strict";

const storage = globalThis.AvanteStorage;
const keys = storage.KEYS;
const form = document.getElementById("preferences");
const amountInput = document.getElementById("amount");
const collapsedInput = document.getElementById("collapsed");
const diagnosticsInput = document.getElementById("diagnostics");
const amountError = document.getElementById("amount-error");
const status = document.getElementById("status");
const saveButton = document.getElementById("save");
const unlockButton = document.getElementById("unlock");
const changePasswordButton = document.getElementById("change-password");
const passwordModal = document.getElementById("password-modal");
const passwordForm = document.getElementById("password-form");
const passwordProtection = new globalThis.AvantePasswordProtection(storage);
let goalUnlocked = false;

const parseAmount = (value) => {
  let text = String(value || "").trim().replace(/[^\d,.-]/g, "");
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
};

const formatAmount = (amount) =>
  amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const showStatus = (message, error = false) => {
  status.textContent = message;
  status.classList.toggle("error", error);
};

const setGoalUnlocked = (unlocked) => {
  goalUnlocked = unlocked;
  amountInput.disabled = !unlocked;
  saveButton.disabled = !unlocked;
  unlockButton.textContent = unlocked ? "Edição desbloqueada" : "Desbloquear edição";
  unlockButton.disabled = unlocked;
};

const closePasswordModal = () => {
  passwordModal.hidden = true;
  passwordForm.reset();
  document.getElementById("password-error").textContent = "";
};

const openPasswordModal = (mode, purpose = "unlock") => {
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
  passwordForm.reset();
  passwordForm.dataset.mode = mode;
  passwordForm.dataset.purpose = purpose;
  const currentField = passwordForm.querySelector("[data-field=current]");
  const confirmField = passwordForm.querySelector("[data-field=confirm]");
  currentField.hidden = !settings.current;
  currentField.querySelector("input").required = settings.current;
  confirmField.hidden = !settings.confirm;
  confirmField.querySelector("input").required = settings.confirm;
  passwordForm.elements.password.autocomplete =
    mode === "login" ? "current-password" : "new-password";
  passwordForm.querySelector("[data-field=password]").firstChild.textContent =
    settings.passwordLabel;
  document.getElementById("password-title").textContent = settings.title;
  document.getElementById("password-description").textContent =
    settings.description;
  document.getElementById("password-submit").textContent = settings.submit;
  document.getElementById("password-error").textContent = "";
  passwordModal.hidden = false;
  window.setTimeout(
    () =>
      (settings.current
        ? passwordForm.elements.currentPassword
        : passwordForm.elements.password
      ).focus(),
    0
  );
};

const requestUnlock = async () => {
  const mode = (await passwordProtection.hasPassword()) ? "login" : "setup";
  openPasswordModal(mode, "unlock");
};

const loadPreferences = async () => {
  const values = await storage.get([
    keys.goal,
    keys.collapsed,
    keys.diagnostics
  ]);
  const goal = values[keys.goal] || { amount: 0, period: "monthly" };
  const normalizedGoal =
    globalThis.AvanteGoalCalculator.normalizeMonthlyGoal(goal);

  amountInput.value =
    normalizedGoal.amount > 0 ? formatAmount(normalizedGoal.amount) : "";
  if (
    normalizedGoal.amount > 0 &&
    (goal.period !== "monthly" || goal.amount !== normalizedGoal.amount)
  ) {
    await storage.set({ [keys.goal]: normalizedGoal });
  }
  collapsedInput.checked = Boolean(values[keys.collapsed]);
  diagnosticsInput.checked = Boolean(values[keys.diagnostics]);
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!goalUnlocked) {
    showStatus("Digite a senha para alterar a meta.", true);
    await requestUnlock();
    return;
  }
  const amount = parseAmount(amountInput.value);

  amountError.hidden = amount > 0;
  amountInput.setAttribute("aria-invalid", String(!(amount > 0)));
  if (!(amount > 0)) {
    showStatus("Revise os campos destacados.", true);
    amountInput.focus();
    return;
  }

  saveButton.disabled = true;
  showStatus("Salvando…");
  try {
    await storage.set({
      [keys.goal]: { amount, period: "monthly" },
      [keys.collapsed]: collapsedInput.checked,
      [keys.diagnostics]: diagnosticsInput.checked
    });
    amountInput.value = formatAmount(amount);
    showStatus("Configurações salvas.");
  } catch (error) {
    showStatus(`Não foi possível salvar: ${error.message}`, true);
  } finally {
    saveButton.disabled = false;
  }
});

amountInput.addEventListener("input", () => {
  amountError.hidden = true;
  amountInput.removeAttribute("aria-invalid");
});

unlockButton.addEventListener("click", () => {
  requestUnlock().catch((error) =>
    showStatus(`Não foi possível acessar a senha: ${error.message}`, true)
  );
});

changePasswordButton.addEventListener("click", async () => {
  try {
    const hasPassword = await passwordProtection.hasPassword();
    openPasswordModal(hasPassword ? "change" : "setup", "change");
  } catch (error) {
    showStatus(`Não foi possível acessar a senha: ${error.message}`, true);
  }
});

passwordModal.querySelectorAll("[data-close-password]").forEach((button) => {
  button.addEventListener("click", closePasswordModal);
});

passwordForm.elements.showPassword.addEventListener("change", (event) => {
  const type = event.currentTarget.checked ? "text" : "password";
  passwordForm
    .querySelectorAll("input[type=password], input[type=text]")
    .forEach((input) => {
      if (input.name !== "showPassword") input.type = type;
    });
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = passwordForm.dataset.mode;
  const purpose = passwordForm.dataset.purpose;
  const password = passwordForm.elements.password.value;
  const confirmation = passwordForm.elements.confirmation.value;
  const currentPassword = passwordForm.elements.currentPassword.value;
  const errorElement = document.getElementById("password-error");
  const submit = document.getElementById("password-submit");

  if (mode !== "login" && password.length < 4) {
    errorElement.textContent = "A senha deve possuir no mínimo 4 caracteres.";
    return;
  }
  if (mode !== "login" && password !== confirmation) {
    errorElement.textContent = "As senhas são diferentes.";
    return;
  }

  submit.disabled = true;
  errorElement.textContent = "";
  try {
    const result =
      mode === "setup"
        ? await passwordProtection.createPassword(password)
        : mode === "change"
          ? await passwordProtection.changePassword(currentPassword, password)
          : await passwordProtection.verifyPassword(password);

    if (!result.ok) {
      const messages = {
        blocked: "Muitas tentativas. Aguarde 5 minutos.",
        incorrect:
          mode === "change" ? "Senha atual incorreta." : "Senha incorreta.",
        "too-short": "A senha deve possuir no mínimo 4 caracteres.",
        "already-configured": "Uma senha já foi cadastrada.",
        "not-configured": "Nenhuma senha foi cadastrada."
      };
      errorElement.textContent =
        messages[result.reason] || "Não foi possível validar a senha.";
      return;
    }

    closePasswordModal();
    if (purpose === "unlock" || mode === "setup") {
      setGoalUnlocked(true);
      amountInput.focus();
      showStatus("Edição da meta desbloqueada.");
    } else {
      showStatus("Senha alterada.");
    }
  } catch (error) {
    errorElement.textContent =
      `Não foi possível acessar o armazenamento: ${error.message}`;
  } finally {
    submit.disabled = false;
  }
});

loadPreferences().catch((error) => {
  showStatus(`Não foi possível carregar as configurações: ${error.message}`, true);
  saveButton.disabled = true;
});

setGoalUnlocked(false);
