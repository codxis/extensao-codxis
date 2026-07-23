(function (root) {
  "use strict";

  const isValidDate = (date) =>
    date instanceof Date && !Number.isNaN(date.getTime());

  const toLocalDateKey = (date = new Date()) => {
    if (!isValidDate(date)) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const currentMonthPrefix = (date = new Date()) =>
    toLocalDateKey(date)?.slice(0, 7) || null;

  const normalizeHistory = (records, date = new Date()) => {
    const prefix = currentMonthPrefix(date);
    if (!prefix || !Array.isArray(records)) return [];
    const consolidated = new Map();

    for (const record of records) {
      if (
        typeof record?.date !== "string" ||
        !record.date.startsWith(`${prefix}-`) ||
        !Number.isFinite(record.timestamp) ||
        !Number.isFinite(record.monthlySales) ||
        record.monthlySales < 0
      ) {
        continue;
      }
      const previous = consolidated.get(record.date);
      if (!previous || record.timestamp >= previous.timestamp) {
        consolidated.set(record.date, {
          date: record.date,
          timestamp: record.timestamp,
          monthlySales: record.monthlySales
        });
      }
    }

    return Array.from(consolidated.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  };

  const consolidateDailySale = (
    records,
    monthlySales,
    date = new Date()
  ) => {
    if (
      !Number.isFinite(monthlySales) ||
      monthlySales < 0 ||
      !isValidDate(date)
    ) {
      return normalizeHistory(records, date);
    }
    const normalized = normalizeHistory(records, date);
    const dateKey = toLocalDateKey(date);
    const nextRecord = {
      date: dateKey,
      timestamp: date.getTime(),
      monthlySales
    };
    const index = normalized.findIndex((record) => record.date === dateKey);
    if (index >= 0) normalized[index] = nextRecord;
    else normalized.push(nextRecord);
    return normalized.sort((a, b) => a.date.localeCompare(b.date));
  };

  class SalesHistory {
    constructor(storage, now = () => new Date()) {
      this.storage = storage;
      this.key = storage.KEYS.salesHistory;
      this.now = now;
      this.pending = Promise.resolve();
    }

    async load() {
      const values = await this.storage.get([this.key]);
      const stored = values[this.key];
      const normalized = normalizeHistory(stored, this.now());
      if (JSON.stringify(stored || []) !== JSON.stringify(normalized)) {
        await this.storage.set({ [this.key]: normalized });
      }
      return normalized;
    }

    record(monthlySales, date = this.now()) {
      this.pending = this.pending.then(async () => {
        if (
          !Number.isFinite(monthlySales) ||
          monthlySales < 0 ||
          !isValidDate(date)
        ) {
          return this.load();
        }
        const values = await this.storage.get([this.key]);
        const history = consolidateDailySale(
          values[this.key],
          monthlySales,
          date
        );
        await this.storage.set({ [this.key]: history });
        return history;
      });
      return this.pending;
    }
  }

  const api = Object.freeze({
    SalesHistory,
    toLocalDateKey,
    currentMonthPrefix,
    normalizeHistory,
    consolidateDailySale
  });

  root.AvanteSalesHistory = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
