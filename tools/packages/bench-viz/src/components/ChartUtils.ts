import * as Plot from "@observablehq/plot";
import { createLegendData } from "./ChartStyles.ts";

/** @return chart container with legend positioned in upper right */
export function createChartWithLegend(
  plot: Element,
  benchmarkNames: string[],
): HTMLElement {
  const chartContainer = document.createElement("div");
  chartContainer.style.display = "flex";
  chartContainer.style.alignItems = "flex-start";
  chartContainer.style.position = "relative";
  chartContainer.appendChild(plot);

  const legendData = createLegendData(benchmarkNames);
  const legend = Plot.legend({
    color: {
      type: "ordinal",
      domain: legendData.map(d => d.name),
      range: legendData.map(d => d.style.color),
    },
    columns: "1",
    marginTop: -10,
    marginLeft: 10,
    width: 120,
  });

  const legendContainer = document.createElement("div");
  legendContainer.style.position = "absolute";
  legendContainer.style.top = "-10px";
  legendContainer.style.right = "-10px";
  legendContainer.appendChild(legend);
  chartContainer.appendChild(legendContainer);

  return chartContainer;
}

export function createAxisConfig(
  label: string,
  config?: Partial<{
    labelOffset: number;
    domain: [number, number] | null;
    tickFormat: (d: number) => string;
    grid: boolean;
  }>,
) {
  return {
    label,
    labelAnchor: "center" as const,
    labelArrow: "none" as const,
    labelOffset: config?.labelOffset ?? 45,
    grid: config?.grid ?? false,
    ...(config?.domain && { domain: config.domain }),
    ...(config?.tickFormat && { tickFormat: config.tickFormat }),
  };
}

export const chartConfig = {
  margins: { left: 70, right: 10, bottom: 60 },
  dimensions: { width: 550, height: 300 },
  style: { fontSize: "12px" },
};
