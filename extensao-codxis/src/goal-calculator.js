(function (root) {
  "use strict";

  const validNumber = (value) =>
    typeof value === "number" && Number.isFinite(value);

  const calculateRemainingAmount = (monthlyGoal, monthlySales) => {
    if (!validNumber(monthlyGoal) || monthlyGoal <= 0) return 0;
    if (!validNumber(monthlySales)) return 0;
    return Math.max(monthlyGoal - monthlySales, 0);
  };

  // Usa o calendário local. O dia atual é incluído na quantidade restante.
  const getRemainingDaysInMonth = (date = new Date()) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 0;
    const lastDay = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0
    ).getDate();
    return lastDay - date.getDate() + 1;
  };

  const calculateDailyRequired = (remainingAmount, remainingDays) => {
    if (
      !validNumber(remainingAmount) ||
      remainingAmount <= 0 ||
      !Number.isInteger(remainingDays) ||
      remainingDays <= 0
    ) {
      return 0;
    }
    return remainingAmount / remainingDays;
  };

  const calculateWeeklyRequired = (dailyRequired, remainingDays) => {
    if (
      !validNumber(dailyRequired) ||
      dailyRequired <= 0 ||
      !Number.isInteger(remainingDays) ||
      remainingDays <= 0
    ) {
      return 0;
    }
    return dailyRequired * Math.min(7, remainingDays);
  };

  const calculateGoalProgress = (monthlyGoal, monthlySales) => {
    if (
      !validNumber(monthlyGoal) ||
      monthlyGoal <= 0 ||
      !validNumber(monthlySales)
    ) {
      return 0;
    }
    return (monthlySales / monthlyGoal) * 100;
  };

  const calculateSurplus = (monthlyGoal, monthlySales) => {
    if (!validNumber(monthlyGoal) || monthlyGoal <= 0) return 0;
    if (!validNumber(monthlySales)) return 0;
    return Math.max(monthlySales - monthlyGoal, 0);
  };

  const calculateMonthlyGoalMetrics = (
    monthlyGoal,
    monthlySales,
    date = new Date()
  ) => {
    const remainingDays = getRemainingDaysInMonth(date);
    const remainingAmount = calculateRemainingAmount(monthlyGoal, monthlySales);
    const dailyRequired = calculateDailyRequired(
      remainingAmount,
      remainingDays
    );
    const windowDays = Math.min(7, remainingDays);
    const weeklyRequired = calculateWeeklyRequired(
      dailyRequired,
      remainingDays
    );
    const progress = calculateGoalProgress(monthlyGoal, monthlySales);

    return {
      remainingAmount,
      remainingDays,
      dailyRequired,
      windowDays,
      weeklyRequired,
      progress,
      surplus: calculateSurplus(monthlyGoal, monthlySales),
      aboveGoalPercentage: Math.max(progress - 100, 0)
    };
  };

  const normalizeMonthlyGoal = (goal) => {
    const amount =
      validNumber(goal?.monthlyAmount) && goal.monthlyAmount > 0
        ? goal.monthlyAmount
        : goal?.amount;
    return validNumber(amount) && amount > 0
      ? { amount, period: "monthly" }
      : { amount: 0, period: "monthly" };
  };

  const api = Object.freeze({
    calculateRemainingAmount,
    getRemainingDaysInMonth,
    calculateDailyRequired,
    calculateWeeklyRequired,
    calculateGoalProgress,
    calculateSurplus,
    calculateMonthlyGoalMetrics,
    normalizeMonthlyGoal
  });

  root.AvanteGoalCalculator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
