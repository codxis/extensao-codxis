(function (root) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const DIMENSIONS = Object.freeze({
    width: 640,
    height: 170,
    left: 42,
    right: 14,
    top: 15,
    bottom: 27
  });

  const calculateChartModel = (
    history,
    monthlyGoal,
    dimensions = DIMENSIONS
  ) => {
    const records = Array.isArray(history)
      ? history.filter(
          (record) =>
            typeof record?.date === "string" &&
            Number.isFinite(record.timestamp) &&
            Number.isFinite(record.monthlySales) &&
            record.monthlySales >= 0
        )
      : [];
    const goal = Number.isFinite(monthlyGoal) && monthlyGoal > 0
      ? monthlyGoal
      : null;
    const maximum = Math.max(
      0,
      goal || 0,
      ...records.map((record) => record.monthlySales)
    );
    const yMaximum = maximum > 0 ? maximum * 1.1 : 1;
    const chartWidth = dimensions.width - dimensions.left - dimensions.right;
    const chartHeight = dimensions.height - dimensions.top - dimensions.bottom;
    const xFor = (index) =>
      records.length <= 1
        ? dimensions.left + chartWidth / 2
        : dimensions.left + (index / (records.length - 1)) * chartWidth;
    const yFor = (value) =>
      dimensions.top + chartHeight - (value / yMaximum) * chartHeight;
    const points = records.map((record, index) => ({
      ...record,
      x: xFor(index),
      y: yFor(record.monthlySales)
    }));

    return {
      dimensions,
      points,
      yMaximum,
      baselineY: dimensions.top + chartHeight,
      goal,
      goalY: goal ? yFor(goal) : null
    };
  };

  const createSvgElement = (name, attributes = {}) => {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, String(value));
    }
    return element;
  };

  class MiniChart {
    constructor(rootElement, options) {
      this.root = rootElement;
      this.money = options.money;
      this.percentage = options.percentage;
      this.locale = options.locale;
      this.svg = rootElement.querySelector("svg");
      this.empty = rootElement.querySelector("[data-role=chart-empty]");
      this.hint = rootElement.querySelector("[data-role=chart-hint]");
      this.tooltip = rootElement.querySelector("[data-role=chart-tooltip]");
    }

    render(history, monthlyGoal) {
      const model = calculateChartModel(history, monthlyGoal);
      this.svg.replaceChildren();
      this.svg.setAttribute(
        "viewBox",
        `0 0 ${model.dimensions.width} ${model.dimensions.height}`
      );
      this.empty.hidden = model.points.length > 0;
      this.hint.hidden = model.points.length !== 1;
      this.svg.hidden = model.points.length === 0;
      this.hideTooltip();
      if (!model.points.length) return;

      this.svg.appendChild(
        createSvgElement("line", {
          class: "avante-chart-axis",
          x1: model.dimensions.left,
          y1: model.baselineY,
          x2: model.dimensions.width - model.dimensions.right,
          y2: model.baselineY
        })
      );

      if (model.goalY != null) {
        this.svg.appendChild(
          createSvgElement("line", {
            class: "avante-chart-goal",
            x1: model.dimensions.left,
            y1: model.goalY,
            x2: model.dimensions.width - model.dimensions.right,
            y2: model.goalY
          })
        );
        const goalLabel = createSvgElement("text", {
          class: "avante-chart-goal-label",
          x: model.dimensions.left + 4,
          y: Math.max(model.goalY - 5, 10)
        });
        goalLabel.textContent = "Meta";
        this.svg.appendChild(goalLabel);
      }

      const coordinates = model.points.map((point) => `${point.x},${point.y}`);
      if (model.points.length > 1) {
        const area = createSvgElement("path", {
          class: "avante-chart-area",
          d: `M ${model.points[0].x} ${model.baselineY} L ${coordinates.join(
            " L "
          )} L ${model.points.at(-1).x} ${model.baselineY} Z`
        });
        this.svg.appendChild(area);
        this.svg.appendChild(
          createSvgElement("polyline", {
            class: "avante-chart-line",
            points: coordinates.join(" ")
          })
        );
      }

      const labelIndexes = new Set(
        model.points
          .map((_, index) => index)
          .filter(
            (index) =>
              model.points.length <= 6 ||
              index === 0 ||
              index === model.points.length - 1 ||
              index % Math.ceil(model.points.length / 5) === 0
          )
      );

      model.points.forEach((point, index) => {
        const label = this.accessibleLabel(point, monthlyGoal);
        const circle = createSvgElement("circle", {
          class: "avante-chart-point",
          cx: point.x,
          cy: point.y,
          r: 4,
          tabindex: 0,
          role: "img",
          "aria-label": label
        });
        circle.addEventListener("mouseenter", () =>
          this.showTooltip(point, monthlyGoal, model)
        );
        circle.addEventListener("mouseleave", () => this.hideTooltip());
        circle.addEventListener("focus", () =>
          this.showTooltip(point, monthlyGoal, model)
        );
        circle.addEventListener("blur", () => this.hideTooltip());
        this.svg.appendChild(circle);

        if (labelIndexes.has(index)) {
          const text = createSvgElement("text", {
            class: "avante-chart-date",
            x: point.x,
            y: model.baselineY + 18,
            "text-anchor": "middle"
          });
          text.textContent = point.date.slice(8, 10);
          this.svg.appendChild(text);
        }
      });
    }

    formatDateTime(point) {
      const date = new Date(point.timestamp);
      return date.toLocaleString(this.locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    accessibleLabel(point, monthlyGoal) {
      const parts = [
        this.formatDateTime(point),
        `Vendido: ${this.money.format(point.monthlySales)}`
      ];
      if (Number.isFinite(monthlyGoal) && monthlyGoal > 0) {
        parts.push(
          `Meta atingida: ${this.percentage.format(
            (point.monthlySales / monthlyGoal) * 100
          )}%`
        );
      }
      return parts.join(". ");
    }

    showTooltip(point, monthlyGoal, model) {
      const lines = [
        this.formatDateTime(point),
        `Vendido: ${this.money.format(point.monthlySales)}`
      ];
      if (Number.isFinite(monthlyGoal) && monthlyGoal > 0) {
        lines.push(
          `Meta atingida: ${this.percentage.format(
            (point.monthlySales / monthlyGoal) * 100
          )}%`
        );
      }
      this.tooltip.textContent = lines.join("\n");
      this.tooltip.style.left = `${(point.x / model.dimensions.width) * 100}%`;
      this.tooltip.style.top = `${(point.y / model.dimensions.height) * 100}%`;
      const horizontalOffset =
        point.x > model.dimensions.width * 0.78
          ? "-100%"
          : point.x < model.dimensions.width * 0.22
            ? "0"
            : "-50%";
      this.tooltip.style.transform = `translate(${horizontalOffset}, -110%)`;
      this.tooltip.hidden = false;
    }

    hideTooltip() {
      this.tooltip.hidden = true;
    }
  }

  const api = Object.freeze({ MiniChart, calculateChartModel, DIMENSIONS });
  root.AvanteMiniChart = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
