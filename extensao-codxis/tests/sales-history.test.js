"use strict";

const assert = require("node:assert/strict");
const historyApi = require("../src/sales-history.js");

assert.deepEqual(
  historyApi.normalizeHistory([], new Date(2026, 6, 23, 10)),
  []
);

let history = historyApi.consolidateDailySale(
  [],
  100,
  new Date(2026, 6, 20, 9, 0)
);
assert.equal(history.length, 1);
assert.equal(history[0].monthlySales, 100);

history = historyApi.consolidateDailySale(
  history,
  150.75,
  new Date(2026, 6, 20, 14, 25)
);
assert.equal(history.length, 1);
assert.equal(history[0].monthlySales, 150.75);
assert.equal(history[0].timestamp, new Date(2026, 6, 20, 14, 25).getTime());

history = historyApi.consolidateDailySale(
  history,
  310,
  new Date(2026, 6, 21, 11, 30)
);
assert.equal(history.length, 2);
assert.deepEqual(history.map((record) => record.date), [
  "2026-07-20",
  "2026-07-21"
]);

const validZero = historyApi.consolidateDailySale(
  [],
  0,
  new Date(2026, 6, 1, 8)
);
assert.equal(validZero[0].monthlySales, 0);
assert.deepEqual(
  historyApi.consolidateDailySale(validZero, Number.NaN, new Date(2026, 6, 2)),
  validZero
);

const mixedMonths = [
  {
    date: "2026-06-30",
    timestamp: new Date(2026, 5, 30, 18).getTime(),
    monthlySales: 9000
  },
  ...history
];
assert.deepEqual(
  historyApi
    .normalizeHistory(mixedMonths, new Date(2026, 6, 23))
    .map((record) => record.date),
  ["2026-07-20", "2026-07-21"]
);
assert.deepEqual(
  historyApi.normalizeHistory(mixedMonths, new Date(2026, 7, 1)),
  []
);

const storageValues = { "avante.salesHistory": mixedMonths };
const storage = {
  KEYS: { salesHistory: "avante.salesHistory" },
  async get(keys) {
    return Object.fromEntries(keys.map((key) => [key, storageValues[key]]));
  },
  async set(values) {
    Object.assign(storageValues, values);
  }
};

(async () => {
  const repository = new historyApi.SalesHistory(
    storage,
    () => new Date(2026, 6, 23, 15)
  );
  const loaded = await repository.load();
  assert.equal(loaded.length, 2);
  const recorded = await repository.record(450.5);
  assert.equal(recorded.length, 3);
  assert.equal(recorded.at(-1).date, "2026-07-23");
  assert.equal(recorded.at(-1).monthlySales, 450.5);

  const reopened = new historyApi.SalesHistory(
    storage,
    () => new Date(2026, 6, 23, 16)
  );
  assert.equal((await reopened.load()).length, 3);
  console.log("Todos os testes de histórico de vendas passaram.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
