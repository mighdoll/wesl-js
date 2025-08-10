import * as Plot from "@observablehq/plot";
import * as d3 from "d3";
import type { PlotDataPoint } from "../types.ts";
import { getBenchmarkStyles, createLegendData } from "./ChartStyles.ts";

export class TimeSeriesChart {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(timeSeries: PlotDataPoint[]): void {
    // Clear previous content
    this.container.innerHTML = "";

    if (timeSeries.length === 0) {
      this.container.innerHTML =
        '<div class="error">No time series data available</div>';
      return;
    }

    try {
      const benchmarks = [...new Set(timeSeries.map(d => d.benchmark))];

      // Keep values in original milliseconds and determine best unit
      const sampleData = timeSeries.map(d => ({
        benchmark: d.benchmark,
        sample: d.iteration, // Use actual sample iteration for overlapping
        value: d.value, // Keep in milliseconds
        isBaseline: d.isBaseline || d.benchmark.includes("(baseline)"),
      }));

      // Determine appropriate time unit and conversion
      const allValues = sampleData.map(d => d.value);
      const minVal = d3.min(allValues)!;
      const maxVal = d3.max(allValues)!;
      const avgVal = d3.mean(allValues)!;

      let timeUnit: string;
      let unitSuffix: string;
      let convertValue: (ms: number) => number;
      let formatValue: (d: number) => string;

      if (avgVal < 0.001) {
        // Nanoseconds
        timeUnit = "ns";
        unitSuffix = "ns";
        convertValue = ms => ms * 1000000;
        formatValue = d => d3.format(",.0f")(d);
      } else if (avgVal < 1) {
        // Microseconds
        timeUnit = "μs";
        unitSuffix = "μs";
        convertValue = ms => ms * 1000;
        formatValue = d => d3.format(",.1f")(d);
      } else {
        // Milliseconds
        timeUnit = "ms";
        unitSuffix = "ms";
        convertValue = ms => ms;
        formatValue = d => d3.format(",.1f")(d);
      }

      // Convert values for display
      const convertedData = sampleData.map(d => ({
        ...d,
        displayValue: convertValue(d.value),
      }));

      // Smart Y-axis range - don't start at 0
      const convertedValues = convertedData.map(d => d.displayValue);
      const dataMin = d3.min(convertedValues)!;
      const dataMax = d3.max(convertedValues)!;
      const dataRange = dataMax - dataMin;

      // Start Y-axis at ~10-20% below minimum value, but with nice round numbers
      const padding = Math.max(dataRange * 0.15, dataRange * 0.1);
      let yMin = dataMin - padding;

      // Round down to a nice number
      const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(yMin))));
      yMin = Math.floor(yMin / magnitude) * magnitude;

      // Ensure we don't go below 0 for positive data
      if (dataMin > 0 && yMin < 0) {
        yMin = 0;
      }

      const yMax = dataMax + dataRange * 0.05;

      const benchmarkStyles = getBenchmarkStyles(benchmarks);
      
      const plot = Plot.plot({
        marginLeft: 70,
        marginBottom: 60,
        marginRight: 10, // Reduced to make room for external legend
        width: 550,
        height: 300,
        style: { fontSize: "12px" },
        x: {
          label: "Sample",
          labelAnchor: "center",
          labelOffset: 45,
          labelArrow: "none",
          grid: true,
          domain: [0, d3.max(convertedData, d => d.sample)!],
          tickFormat: d => d.toString(),
        },
        y: {
          label: `Time (${timeUnit})`,
          labelAnchor: "center",
          labelArrow: "none",
          grid: true,
          domain: [yMin, yMax],
          tickFormat: formatValue,
        },
        marks: [
          ...benchmarks.map(benchmark => {
            const style = benchmarkStyles.get(benchmark)!;
            const benchmarkData = convertedData.filter(d => 
              (d.isBaseline && style.isBaseline) || (!d.isBaseline && !style.isBaseline)
            );
            
            return Plot.dot(benchmarkData, {
              x: "sample",
              y: "displayValue", 
              fill: style.fillColor,
              stroke: style.strokeColor,
              strokeWidth: style.strokeWidth,
              r: 3,
              fillOpacity: style.fillOpacity,
              strokeOpacity: style.strokeOpacity,
              title: d => `${benchmark}: Sample ${d.sample}: ${formatValue(d.displayValue)}${unitSuffix}`,
            });
          }),
          // Bottom baseline (black line at the bottom of the domain)
          Plot.ruleY([yMin], { stroke: "black", strokeWidth: 1 }),
        ],
      });

      // Create container for plot and legend
      const chartContainer = document.createElement("div");
      chartContainer.style.display = "flex";
      chartContainer.style.alignItems = "flex-start";
      chartContainer.style.position = "relative";
      
      chartContainer.appendChild(plot);
      
      // Create legend using Plot.legend()
      const legendData = createLegendData(benchmarks);
      
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
      console.error("Error rendering time series:", error);
      this.container.innerHTML = `<div class="error">Error rendering time series: ${error instanceof Error ? error.message : String(error)}</div>`;
    }
  }
}
