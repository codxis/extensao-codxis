(function (root) {
  "use strict";

  const MAX_ATTEMPTS = 5;
  const BLOCK_DURATION_MS = 5 * 60 * 1000;
  const MIN_PASSWORD_LENGTH = 4;

  const bytesToHex = (bytes) =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  class PasswordProtection {
    constructor(storage, options = {}) {
      this.storage = storage;
      this.keys = storage.KEYS;
      this.crypto = options.crypto || root.crypto;
      this.now = options.now || (() => Date.now());
    }

    async hashPassword(password, salt) {
      const input = new TextEncoder().encode(`${salt}:${password}`);
      const digest = await this.crypto.subtle.digest("SHA-256", input);
      return bytesToHex(new Uint8Array(digest));
    }

    createSalt() {
      const bytes = new Uint8Array(16);
      this.crypto.getRandomValues(bytes);
      return bytesToHex(bytes);
    }

    async getStoredState() {
      const values = await this.storage.get([
        this.keys.password,
        this.keys.passwordAttempts,
        this.keys.passwordBlockedUntil
      ]);
      return {
        password: values[this.keys.password] || null,
        attempts: Number(values[this.keys.passwordAttempts]) || 0,
        blockedUntil: Number(values[this.keys.passwordBlockedUntil]) || 0
      };
    }

    async hasPassword() {
      const { password } = await this.getStoredState();
      return Boolean(password?.hash && password?.salt);
    }

    async getBlockStatus() {
      const state = await this.getStoredState();
      const blocked = state.blockedUntil > this.now();
      if (!blocked && state.blockedUntil) {
        await this.resetAttempts();
        return { blocked: false, blockedUntil: 0 };
      }
      return { blocked, blockedUntil: state.blockedUntil };
    }

    async resetAttempts() {
      await this.storage.set({
        [this.keys.passwordAttempts]: 0,
        [this.keys.passwordBlockedUntil]: 0
      });
    }

    async savePassword(password) {
      if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
        return { ok: false, reason: "too-short" };
      }
      const salt = this.createSalt();
      const hash = await this.hashPassword(password, salt);
      await this.storage.set({
        [this.keys.password]: {
          algorithm: "SHA-256",
          salt,
          hash
        },
        [this.keys.passwordAttempts]: 0,
        [this.keys.passwordBlockedUntil]: 0
      });
      return { ok: true };
    }

    async createPassword(password) {
      if (await this.hasPassword()) {
        return { ok: false, reason: "already-configured" };
      }
      return this.savePassword(password);
    }

    async verifyPassword(password) {
      const state = await this.getStoredState();
      if (!state.password?.hash || !state.password?.salt) {
        return { ok: false, reason: "not-configured" };
      }
      if (state.blockedUntil > this.now()) {
        return {
          ok: false,
          reason: "blocked",
          blockedUntil: state.blockedUntil
        };
      }
      if (state.blockedUntil) await this.resetAttempts();

      const hash = await this.hashPassword(password, state.password.salt);
      if (hash === state.password.hash) {
        await this.resetAttempts();
        return { ok: true };
      }

      const attempts = state.blockedUntil ? 1 : state.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        const blockedUntil = this.now() + BLOCK_DURATION_MS;
        await this.storage.set({
          [this.keys.passwordAttempts]: attempts,
          [this.keys.passwordBlockedUntil]: blockedUntil
        });
        return { ok: false, reason: "blocked", blockedUntil };
      }
      await this.storage.set({
        [this.keys.passwordAttempts]: attempts,
        [this.keys.passwordBlockedUntil]: 0
      });
      return {
        ok: false,
        reason: "incorrect",
        attemptsRemaining: MAX_ATTEMPTS - attempts
      };
    }

    async changePassword(currentPassword, newPassword) {
      if (
        typeof newPassword !== "string" ||
        newPassword.length < MIN_PASSWORD_LENGTH
      ) {
        return { ok: false, reason: "too-short" };
      }
      const verified = await this.verifyPassword(currentPassword);
      if (!verified.ok) return verified;
      return this.savePassword(newPassword);
    }
  }

  PasswordProtection.MAX_ATTEMPTS = MAX_ATTEMPTS;
  PasswordProtection.BLOCK_DURATION_MS = BLOCK_DURATION_MS;
  PasswordProtection.MIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;

  root.AvantePasswordProtection = PasswordProtection;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = PasswordProtection;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
