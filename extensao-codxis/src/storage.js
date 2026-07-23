(function (root) {
  "use strict";

  const KEYS = Object.freeze({
    goal: "avante.goal",
    snapshot: "avante.snapshot",
    collapsed: "avante.collapsed",
    diagnostics: "avante.diagnostics",
    password: "avante.password",
    passwordAttempts: "avante.passwordAttempts",
    passwordBlockedUntil: "avante.passwordBlockedUntil",
    salesHistory: "avante.salesHistory"
  });

  const get = (keys) =>
    new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (values) => {
        const error = chrome.runtime.lastError;
        error ? reject(error) : resolve(values);
      });
    });

  const set = (values) =>
    new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        const error = chrome.runtime.lastError;
        error ? reject(error) : resolve();
      });
    });

  root.AvanteStorage = Object.freeze({ KEYS, get, set });
})(globalThis);
