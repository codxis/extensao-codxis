"use strict";

const assert = require("node:assert/strict");
const calculator = require("../src/goal-calculator.js");

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Esperado ${expected}, recebido ${actual}`
  );
};

const metrics = calculator.calculateMonthlyGoalMetrics(
  10000,
  6200,
  new Date(2026, 3, 20)
);
assert.equal(metrics.remainingAmount, 3800);
assert.equal(metrics.remainingDays, 11);
closeTo(metrics.dailyRequired, 3800 / 11);
closeTo(metrics.weeklyRequired, (3800 / 11) * 7);

const completed = calculator.calculateMonthlyGoalMetrics(
  10000,
  10000,
  new Date(2026, 3, 20)
);
assert.deepEqual(
  {
    remaining: completed.remainingAmount,
    daily: completed.dailyRequired,
    weekly: completed.weeklyRequired,
    surplus: completed.surplus,
    progress: completed.progress
  },
  { remaining: 0, daily: 0, weekly: 0, surplus: 0, progress: 100 }
);

const surplus = calculator.calculateMonthlyGoalMetrics(
  10000,
  11280,
  new Date(2026, 3, 20)
);
assert.equal(surplus.remainingAmount, 0);
assert.equal(surplus.dailyRequired, 0);
assert.equal(surplus.weeklyRequired, 0);
assert.equal(surplus.surplus, 1280);
closeTo(surplus.progress, 112.8);
closeTo(surplus.aboveGoalPercentage, 12.8);

const lastDay = calculator.calculateMonthlyGoalMetrics(
  10000,
  6200,
  new Date(2026, 3, 30)
);
assert.equal(lastDay.remainingDays, 1);
assert.equal(lastDay.dailyRequired, 3800);
assert.equal(lastDay.weeklyRequired, 3800);

const fourDays = calculator.calculateMonthlyGoalMetrics(
  10000,
  6200,
  new Date(2026, 3, 27)
);
assert.equal(fourDays.remainingDays, 4);
closeTo(fourDays.weeklyRequired, fourDays.dailyRequired * 4);

assert.equal(calculator.getRemainingDaysInMonth(new Date(2025, 1, 1)), 28);
assert.equal(calculator.getRemainingDaysInMonth(new Date(2024, 1, 1)), 29);
assert.equal(calculator.getRemainingDaysInMonth(new Date(2026, 3, 1)), 30);
assert.equal(calculator.getRemainingDaysInMonth(new Date(2026, 6, 1)), 31);
assert.equal(calculator.getRemainingDaysInMonth(new Date(2026, 6, 31)), 1);

assert.equal(calculator.calculateRemainingAmount(10000, 0), 10000);
assert.equal(calculator.calculateRemainingAmount(0, 100), 0);
assert.equal(calculator.calculateRemainingAmount(-10, 100), 0);
assert.equal(
  calculator.calculateGoalProgress(1000000000.55, 500000000.275),
  50
);
assert.deepEqual(
  calculator.normalizeMonthlyGoal({ amount: 5000, period: "daily" }),
  { amount: 5000, period: "monthly" }
);
assert.deepEqual(
  calculator.normalizeMonthlyGoal({ monthlyAmount: 7500 }),
  { amount: 7500, period: "monthly" }
);

console.log("Todos os testes de cálculo de metas passaram.");
