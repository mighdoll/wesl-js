import * as Plot from "@observablehq/plot";
import * as d3 from "d3";
import type { PlotDataPoint } from "../data/JsonData.ts";
import { getBenchmarkStyles } from "./ChartStyles.ts";
import {
  chartConfig,
  createAxisConfig,
  createChartWithLegend,
} from "./ChartUtils.ts";

interface BinConfig {
  min: number;
  max: number;
  bins: number[];
  maxCount: number;
}

export function renderHistogramChart(
  container: HTMLElement,
  allSamples: PlotDataPoint[],
  benchmarkNames: string[],
): void {
  container.innerHTML = "";

  if (allSamples.length === 0) {
    container.innerHTML = '<div class="error">No sample data available</div>';
    return;
  }

  try {
    const binConfig = calcBinConfig(allSamples, benchmarkNames);

    const plot = Plot.plot({
      ...chartConfig.margins,
      ...chartConfig.dimensions,
      style: chartConfig.style,
      x: createAxisConfig("Time (ms)", {
        domain: [binConfig.min, binConfig.max],
        tickFormat: d => d.toFixed(1),
      }),
      y: createAxisConfig("Count", {
        grid: true,
        labelOffset: 50,
        domain: [0, binConfig.maxCount * 1.1],
      }),
      marks: [
        ...createMarks(allSamples, benchmarkNames, binConfig),
        Plot.ruleY([0]),
      ],
    });

    container.appendChild(createChartWithLegend(plot, benchmarkNames));
  } catch (error) {
    console.error("Error rendering histogram:", error);
    container.innerHTML = `<div class="error">Error rendering histogram: ${error instanceof Error ? error.message : String(error)}</div>`;
  }
}

/** Calculate histogram bins excluding outliers using IQR */
function calcBinConfig(
  allSamples: PlotDataPoint[],
  benchmarkNames: string[],
): BinConfig {
  const values = allSamples.map(d => d.value);
  const sortedValues = values.sort((a, b) => a - b);
  const q1 = d3.quantile(sortedValues, 0.25)!;
  const q3 = d3.quantile(sortedValues, 0.75)!;
  const iqr = q3 - q1;

  const min = Math.max(d3.min(values)!, q1 - 1.5 * iqr);
  const max = Math.min(d3.max(values)!, q3 + 1.5 * iqr);
  const bins = d3.ticks(min, max, 25);

  const allCounts = benchmarkNames.flatMap(benchmarkName => {
    const benchmarkSamples = allSamples.filter(
      d => d.benchmark === benchmarkName,
    );
    const histogram = d3.bin().domain([min, max]).thresholds(bins)(
      benchmarkSamples.map(d => d.value),
    );
    return histogram.map(bin => bin.length);
  });

  return { min, max, bins, maxCount: d3.max(allCounts) || 10 };
}

function createMarks(
  allSamples: PlotDataPoint[],
  benchmarkNames: string[],
  binConfig: BinConfig,
) {
  const benchmarkStyles = getBenchmarkStyles(benchmarkNames);

  return benchmarkNames
    .sort((a, b) => {
      const aBaseline = a.includes("(baseline)");
      const bBaseline = b.includes("(baseline)");
      if (aBaseline && !bBaseline) return -1;
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
          { x: "value", thresholds: binConfig.bins },
        ),
        inset: 0.5,
        fill: style.fillColor === "none" ? style.strokeColor : style.fillColor,
        fillOpacity: style.isBaseline ? 0.6 : 0.8,
        stroke: "none",
      });
    });
}
