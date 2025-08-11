import * as Plot from "@observablehq/plot";
import * as d3 from "d3";
import type { PlotDataPoint } from "../data/JsonData.ts";
import { getBenchmarkStyles } from "./ChartStyles.ts";
import {
  chartConfig,
  createAxisConfig,
  createChartWithLegend,
} from "./ChartUtils.ts";

interface TimeUnit {
  name: string;
  suffix: string;
  convertValue: (ms: number) => number;
  formatValue: (d: number) => string;
}

interface YAxisRange {
  min: number;
  max: number;
}

interface ChartData {
  benchmark: string;
  sample: number;
  value: number;
  displayValue: number;
  isBaseline: boolean;
}

export function renderTimeSeriesChart(
  container: HTMLElement,
  timeSeries: PlotDataPoint[],
): void {
  container.innerHTML = "";

  if (timeSeries.length === 0) {
    container.innerHTML =
      '<div class="error">No time series data available</div>';
    return;
  }

  try {
    const benchmarks = [...new Set(timeSeries.map(d => d.benchmark))];
    const allValues = timeSeries.map(d => d.value);
    const timeUnit = determineTimeUnit(allValues);
    const chartData = prepareData(timeSeries, timeUnit);
    const yAxis = calcYAxisRange(chartData.map(d => d.displayValue));

    const plot = Plot.plot({
      ...chartConfig.margins,
      ...chartConfig.dimensions,
      style: chartConfig.style,
      x: createAxisConfig("Sample", {
        grid: true,
        domain: [0, d3.max(chartData, d => d.sample)!],
        tickFormat: d => d.toString(),
      }),
      y: createAxisConfig(`Time (${timeUnit.name})`, {
        grid: true,
        domain: [yAxis.min, yAxis.max],
        tickFormat: timeUnit.formatValue,
      }),
      marks: [
        ...createMarks(benchmarks, chartData, timeUnit),
        Plot.ruleY([yAxis.min], { stroke: "black", strokeWidth: 1 }),
      ],
    });

    container.appendChild(createChartWithLegend(plot, benchmarks));
  } catch (error) {
    console.error("Error rendering time series:", error);
    container.innerHTML = `<div class="error">Error rendering time series: ${error instanceof Error ? error.message : String(error)}</div>`;
  }
}

function prepareData(
  timeSeries: PlotDataPoint[],
  timeUnit: TimeUnit,
): ChartData[] {
  return timeSeries.map(d => ({
    benchmark: d.benchmark,
    sample: d.iteration,
    value: d.value,
    displayValue: timeUnit.convertValue(d.value),
    isBaseline: d.isBaseline || d.benchmark.includes("(baseline)"),
  }));
}

function createMarks(
  benchmarks: string[],
  chartData: ChartData[],
  timeUnit: TimeUnit,
) {
  const benchmarkStyles = getBenchmarkStyles(benchmarks);

  return benchmarks.map(benchmark => {
    const style = benchmarkStyles.get(benchmark)!;
    const benchmarkData = chartData.filter(
      d =>
        (d.isBaseline && style.isBaseline) ||
        (!d.isBaseline && !style.isBaseline),
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
      title: d =>
        `${benchmark}: Sample ${d.sample}: ${timeUnit.formatValue(d.displayValue)}${timeUnit.suffix}`,
    });
  });
}

/** Choose appropriate time unit based on data magnitude */
function determineTimeUnit(values: number[]): TimeUnit {
  const avgVal = d3.mean(values)!;

  if (avgVal < 0.001) {
    return {
      name: "ns",
      suffix: "ns",
      convertValue: ms => ms * 1000000,
      formatValue: d => d3.format(",.0f")(d),
    };
  }
  if (avgVal < 1) {
    return {
      name: "μs",
      suffix: "μs",
      convertValue: ms => ms * 1000,
      formatValue: d => d3.format(",.1f")(d),
    };
  }
  return {
    name: "ms",
    suffix: "ms",
    convertValue: ms => ms,
    formatValue: d => d3.format(",.1f")(d),
  };
}

function calcYAxisRange(values: number[]): YAxisRange {
  const dataMin = d3.min(values)!;
  const dataMax = d3.max(values)!;
  const dataRange = dataMax - dataMin;
  const padding = Math.max(dataRange * 0.15, dataRange * 0.1);

  let yMin = dataMin - padding;
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(yMin)));
  yMin = Math.floor(yMin / magnitude) * magnitude;

  if (dataMin > 0 && yMin < 0) yMin = 0; // keep positive data above zero
  const yMax = dataMax + dataRange * 0.05;

  return { min: yMin, max: yMax };
}
