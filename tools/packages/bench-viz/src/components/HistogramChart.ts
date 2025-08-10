import * as Plot from "@observablehq/plot";
import * as d3 from "d3";
import type { PlotDataPoint } from "../types.ts";
import { getBenchmarkStyles, createLegendData } from "./ChartStyles.ts";

export class HistogramChart {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(allSamples: PlotDataPoint[], benchmarkNames: string[]): void {
    // Clear previous content
    this.container.innerHTML = "";

    if (allSamples.length === 0) {
      this.container.innerHTML =
        '<div class="error">No sample data available</div>';
      return;
    }

    try {
      // Calculate better bin thresholds based on data range
      const values = allSamples.map(d => d.value);
      const min = d3.min(values)!;
      const max = d3.max(values)!;
      const q1 = d3.quantile(
        values.sort((a, b) => a - b),
        0.25,
      )!;
      const q3 = d3.quantile(values, 0.75)!;
      const iqr = q3 - q1;

      // Focus on the main data range, excluding extreme outliers
      const binMin = Math.max(min, q1 - 1.5 * iqr);
      const binMax = Math.min(max, q3 + 1.5 * iqr);

      // Use overlapping histogram style with standard binning
      const bins = d3.ticks(binMin, binMax, 25);

      // Calculate max count across all benchmarks for y-axis domain
      const allCounts = benchmarkNames.flatMap(benchmarkName => {
        const benchmarkSamples = allSamples.filter(
          d => d.benchmark === benchmarkName,
        );
        const histogram = d3.bin().domain([binMin, binMax]).thresholds(bins)(
          benchmarkSamples.map(d => d.value),
        );
        return histogram.map(bin => bin.length);
      });
      const maxCount = d3.max(allCounts) || 10;

      const benchmarkStyles = getBenchmarkStyles(benchmarkNames);
      
      const plot = Plot.plot({
        marginLeft: 70,
        marginRight: 10, // Reduced to make room for external legend
        marginBottom: 60,
        width: 550,
        height: 300,
        style: { fontSize: "12px" },
        x: {
          label: "Time (ms)",
          labelAnchor: "center",
          domain: [binMin, binMax],
          labelOffset: 45,
          labelArrow: "none",
          tickFormat: d => d.toFixed(1),
        },
        y: {
          label: "Count",
          labelAnchor: "center",
          labelArrow: "none",
          grid: true,
          labelOffset: 50,
          domain: [0, maxCount * 1.1],
        },
        marks: [
          // Overlapping histograms - baseline first (behind), then main benchmark (in front)
          ...benchmarkNames
            .sort((a, b) => {
              const aBaseline = a.includes("(baseline)");
              const bBaseline = b.includes("(baseline)");
              if (aBaseline && !bBaseline) return -1; // baseline first (rendered behind)
              if (!aBaseline && bBaseline) return 1;
              return 0;
            })
            .map(benchmarkName => {
              const benchmarkSamples = allSamples.filter(
                d => d.benchmark === benchmarkName,
              );
              const style = benchmarkStyles.get(benchmarkName)!;

              return Plot.rectY(benchmarkSamples, {
                ...Plot.binX(
                  { y: "count" },
                  {
                    x: "value",
                    thresholds: bins,
                  },
                ),
                inset: 0.5,
                fill: style.fillColor === "none" ? style.strokeColor : style.fillColor,
                fillOpacity: style.isBaseline ? 0.6 : 0.8,
                stroke: "none", // No stroke outline on histogram bars
              });
            }),
          Plot.ruleY([0]),
        ],
      });

      // Create container for plot and legend
      const chartContainer = document.createElement("div");
      chartContainer.style.display = "flex";
      chartContainer.style.alignItems = "flex-start";
      chartContainer.style.position = "relative";
      
      chartContainer.appendChild(plot);
      
      // Create legend using Plot.legend()
      const legendData = createLegendData(benchmarkNames);
      
      const legend = Plot.legend({
        color: {
          type: "ordinal",
          domain: legendData.map(d => d.name),
          range: legendData.map(d => d.style.color),
        },
        columns: 1,
        marginTop: -10,
        marginLeft: 10,
        width: 120,
      });
      
      // Position legend mostly inside plot area, upper right corner
      const legendContainer = document.createElement("div");
      legendContainer.style.position = "absolute";
      legendContainer.style.top = "-10px"; // 10px above plot
      legendContainer.style.right = "-10px"; // Only 10px extending to the right
      legendContainer.appendChild(legend);
      
      chartContainer.appendChild(legendContainer);
      this.container.appendChild(chartContainer);
    } catch (error) {
      console.error("Error rendering histogram:", error);
      this.container.innerHTML = `<div class="error">Error rendering histogram: ${error instanceof Error ? error.message : String(error)}</div>`;
    }
  }
}
