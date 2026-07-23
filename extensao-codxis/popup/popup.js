"use strict";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const message = document.getElementById("message");
const showButton = document.getElementById("show");
const refreshButton = document.getElementById("refresh");
const optionsButton = document.getElementById("options");

const setMessage = (text, error = false) => {
  message.textContent = text;
  message.classList.toggle("error", error);
};

const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
};

const sendToPage = async (type) => {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("Nenhuma aba ativa foi encontrada.");
  return chrome.tabs.sendMessage(tab.id, { type });
};

const loadSummary = async () => {
  const values = await chrome.storage.local.get([
    "avante.goal",
    "avante.snapshot"
  ]);
  const goal = values["avante.goal"];
  const snapshot = values["avante.snapshot"];

  document.getElementById("goal").textContent =
    goal?.amount > 0 ? money.format(goal.amount) : "Não definida";
  document.getElementById("updated").textContent = snapshot?.capturedAt
    ? new Date(snapshot.capturedAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "Ainda não sincronizado";
};

showButton.addEventListener("click", async () => {
  showButton.disabled = true;
  try {
    const response = await sendToPage("AVANTE_REVEAL");
    if (!response?.ok) {
      setMessage(response?.message || "Abra a home do Codxis primeiro.", true);
      return;
    }
    setMessage("Dashboard localizado na página.");
    window.close();
  } catch (_) {
    setMessage(
      "A extensão não foi detectada nesta página. Abra ou atualize o Codxis.",
      true
    );
  } finally {
    showButton.disabled = false;
  }
});

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  try {
    const response = await sendToPage("AVANTE_REFRESH");
    if (!response?.ok) {
      setMessage(response?.message || "Não foi possível atualizar.", true);
      return;
    }
    setMessage("Atualização solicitada. Os valores aparecerão após a captura.");
    window.setTimeout(loadSummary, 500);
  } catch (_) {
    setMessage(
      "Abra uma tela do Codxis para solicitar a atualização.",
      true
    );
  } finally {
    refreshButton.disabled = false;
  }
});

optionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

loadSummary().catch(() =>
  setMessage("Não foi possível ler o armazenamento local.", true)
);
