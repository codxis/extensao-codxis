"use strict";

const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const PasswordProtection = require("../src/password-protection.js");

const keys = {
  password: "avante.password",
  passwordAttempts: "avante.passwordAttempts",
  passwordBlockedUntil: "avante.passwordBlockedUntil"
};

const values = {};
const storage = {
  KEYS: keys,
  async get(requestedKeys) {
    return Object.fromEntries(
      requestedKeys.map((key) => [key, values[key]])
    );
  },
  async set(entries) {
    Object.assign(values, entries);
  }
};

let currentTime = new Date(2026, 6, 23, 12, 0, 0).getTime();
const createProtection = () =>
  new PasswordProtection(storage, {
    crypto: webcrypto,
    now: () => currentTime
  });

(async () => {
  const protection = createProtection();

  assert.equal(await protection.hasPassword(), false);
  assert.deepEqual(await protection.createPassword("123"), {
    ok: false,
    reason: "too-short"
  });
  assert.deepEqual(await protection.createPassword("segredo"), { ok: true });
  assert.equal(await protection.hasPassword(), true);
  assert.equal(values[keys.password].algorithm, "SHA-256");
  assert.notEqual(values[keys.password].hash, "segredo");
  assert.ok(values[keys.password].salt);

  assert.deepEqual(await protection.verifyPassword("segredo"), { ok: true });
  let incorrect = await protection.verifyPassword("errada");
  assert.equal(incorrect.reason, "incorrect");
  assert.equal(incorrect.attemptsRemaining, 4);

  await protection.verifyPassword("errada");
  await protection.verifyPassword("errada");
  await protection.verifyPassword("errada");
  const blocked = await protection.verifyPassword("errada");
  assert.equal(blocked.reason, "blocked");
  assert.equal(values[keys.passwordAttempts], 5);
  assert.equal(
    values[keys.passwordBlockedUntil],
    currentTime + 5 * 60 * 1000
  );

  const correctWhileBlocked = await protection.verifyPassword("segredo");
  assert.equal(correctWhileBlocked.reason, "blocked");

  currentTime += 5 * 60 * 1000 + 1;
  assert.deepEqual(await protection.verifyPassword("segredo"), { ok: true });
  assert.equal(values[keys.passwordAttempts], 0);
  assert.equal(values[keys.passwordBlockedUntil], 0);

  const wrongCurrent = await protection.changePassword("incorreta", "novaSenha");
  assert.equal(wrongCurrent.reason, "incorrect");
  assert.deepEqual(
    await protection.changePassword("segredo", "novaSenha"),
    { ok: true }
  );
  assert.equal((await protection.verifyPassword("segredo")).ok, false);
  assert.deepEqual(await protection.verifyPassword("novaSenha"), { ok: true });

  // Uma nova instância simula fechar e reabrir o navegador.
  const reopenedProtection = createProtection();
  assert.deepEqual(
    await reopenedProtection.verifyPassword("novaSenha"),
    { ok: true }
  );

  console.log("Todos os testes de proteção por senha passaram.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
