"use strict";

const assert = require("node:assert/strict");
const { calculateChartModel } = require("../src/mini-chart.js");

const empty = calculateChartModel([], null);
assert.equal(empty.points.length, 0);
assert.equal(empty.goalY, null);

const onePoint = calculateChartModel(
  [{ date: "2026-07-23", timestamp: 1, monthlySales: 319.8 }],
  null
);
assert.equal(onePoint.points.length, 1);
assert.equal(onePoint.goalY, null);
assert.ok(Number.isFinite(onePoint.points[0].x));
assert.ok(Number.isFinite(onePoint.points[0].y));

const severalPoints = calculateChartModel(
  [
    { date: "2026-07-20", timestamp: 1, monthlySales: 0 },
    { date: "2026-07-21", timestamp: 2, monthlySales: 250 },
    { date: "2026-07-22", timestamp: 3, monthlySales: 600 }
  ],
  1000
);
assert.equal(severalPoints.points.length, 3);
assert.ok(severalPoints.goalY != null);
assert.ok(severalPoints.points[0].x < severalPoints.points[1].x);
assert.ok(severalPoints.points[1].x < severalPoints.points[2].x);

const completed = calculateChartModel(
  [{ date: "2026-07-23", timestamp: 1, monthlySales: 1000 }],
  1000
);
assert.ok(completed.goalY >= completed.points[0].y);

const surplus = calculateChartModel(
  [{ date: "2026-07-23", timestamp: 1, monthlySales: 1280 }],
  1000
);
assert.ok(surplus.points[0].y < surplus.goalY);
assert.ok(surplus.yMaximum > 1280);

console.log("Todos os testes de geometria do mini gráfico passaram.");
