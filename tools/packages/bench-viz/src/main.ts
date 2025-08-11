import { renderHistogramChart } from "./components/HistogramChart.ts";
import { renderQQPlotChart } from "./components/QQPlotChart.ts";
import { renderTimeSeriesChart } from "./components/TimeSeriesChart.ts";
import { BenchmarkDataSource } from "./data/BenchmarkDataSource.ts";
import { calculateQQData } from "./stats/StatisticalUtils.ts";
import type { BenchmarkData, PlotDataPoint } from "./data/JsonData.ts";

interface ProcessedBenchmark {
  name: string;
  samples: number[];
  stats: any; // time statistics from BenchmarkResult
  isBaseline: boolean;
}

/** Main application for rendering benchmark visualizations */
class BenchmarkVisualizationApp {
  private dataSource: BenchmarkDataSource;
  private appContainer: HTMLElement;
  private metadataContainer: HTMLElement;

  constructor() {
    this.dataSource = new BenchmarkDataSource("./data/benchmark-results.json");
    this.appContainer = document.getElementById("app")!;
    this.metadataContainer = document.getElementById("metadata")!;

    this.dataSource.subscribe(this.onDataUpdate.bind(this));
    this.dataSource.startPolling(1000);
  }

  private onDataUpdate(data: BenchmarkData | null): void {
    if (!data) {
      this.showNoData();
      return;
    }

    this.updateMetadata(data);
    this.renderVisualizations(data);
  }

  private showNoData(): void {
    this.metadataContainer.textContent = "Waiting for benchmark data...";
    this.appContainer.innerHTML = `
      <div class="loading">
        <p>No benchmark data available yet.</p>
        <p>Run benchmarks with JSON output to see visualizations.</p>
      </div>
    `;
  }

  private updateMetadata(data: BenchmarkData): void {
    const timestamp = new Date(data.meta.timestamp).toLocaleString();
    this.metadataContainer.innerHTML = `
      Generated: ${timestamp} | 
      Node: ${data.meta.environment.node} | 
      Platform: ${data.meta.environment.platform}
    `;
  }

  private renderVisualizations(data: BenchmarkData): void {
    this.appContainer.innerHTML = "";

    data.suites.forEach((suite, suiteIndex) => {
      const suiteContainer = document.createElement("div");
      this.appContainer.appendChild(suiteContainer);

      suite.groups.forEach((group, groupIndex) => {
        this.renderGroup(group, `${suiteIndex}-${groupIndex}`);
      });
    });
  }

  private renderGroup(group: any, groupId: string): void {
    if (group.benchmarks.length === 0) {
      const errorDiv = document.createElement("div");
      errorDiv.className = "error";
      errorDiv.textContent = "No benchmark data available for this group";
      this.appContainer.appendChild(errorDiv);
      return;
    }

    const groupContainer = document.createElement("div");
    groupContainer.innerHTML = createGroupLayout(groupId);
    this.appContainer.appendChild(groupContainer);

    const benchmarks = prepareBenchmarks(group);
    const { allSamples, timeSeries } = createPlotPoints(benchmarks);
    const benchmarkNames = benchmarks.map(b => b.name);

    this.renderTimeSeries(groupId, timeSeries);
    this.renderHistogram(groupId, allSamples, benchmarkNames);
    this.renderQQPlots(
      groupId,
      benchmarks.filter(b => !b.isBaseline),
    );
    this.renderStats(groupId, benchmarks);
  }

  private renderTimeSeries(groupId: string, timeSeries: PlotDataPoint[]): void {
    const container = document.getElementById(`timeseries-${groupId}`);
    if (!container) return;

    renderTimeSeriesChart(container, timeSeries);
  }

  private renderHistogram(
    groupId: string,
    allSamples: PlotDataPoint[],
    benchmarkNames: string[],
  ): void {
    const container = document.getElementById(`histogram-${groupId}`);
    if (!container) return;

    renderHistogramChart(container, allSamples, benchmarkNames);
  }

  private renderQQPlots(groupId: string, benchmarks: any[]): void {
    const container = document.getElementById(`qq-plots-${groupId}`);
    if (!container) return;

    benchmarks.forEach((benchmark, i) => {
      if (!benchmark.samples || benchmark.samples.length < 3) return;

      const plotContainer = document.createElement("div");
      plotContainer.className = "plot-container";
      plotContainer.innerHTML = `
        <div class="plot-title">Q-Q Plot: ${benchmark.name}</div>
        <div class="plot-description">Tests normality assumption (points should follow diagonal)</div>
        <div id="qq-${groupId}-${i}" class="plot-area">
          <div class="loading">Loading Q-Q plot...</div>
        </div>
      `;

      container.appendChild(plotContainer);

      const qqContainer = document.getElementById(`qq-${groupId}-${i}`);
      if (qqContainer) {
        const qqData = calculateQQData(benchmark.samples);
        renderQQPlotChart(qqContainer, qqData, benchmark.name);
      }
    });
  }

  private renderStats(groupId: string, benchmarks: ProcessedBenchmark[]): void {
    const container = document.getElementById(`stats-${groupId}`);
    if (!container) return;

    container.innerHTML = benchmarks.map(createStatsHTML).join("");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new BenchmarkVisualizationApp();
});

function prepareBenchmarks(group: any): ProcessedBenchmark[] {
  const benchmarks = [];

  if (group.baseline) {
    benchmarks.push({
      name: group.baseline.name + " (baseline)",
      samples: group.baseline.samples,
      stats: group.baseline.time,
      isBaseline: true,
    });
  }

  group.benchmarks.forEach((b: any) => {
    benchmarks.push({
      name: b.name,
      samples: b.samples,
      stats: b.time,
      isBaseline: false,
    });
  });

  return benchmarks;
}

function createPlotPoints(benchmarks: ProcessedBenchmark[]): {
  allSamples: PlotDataPoint[];
  timeSeries: PlotDataPoint[];
} {
  const allSamples: PlotDataPoint[] = [];
  const timeSeries: PlotDataPoint[] = [];

  benchmarks.forEach(b => {
    if (!b.samples || b.samples.length === 0) return;

    b.samples.forEach((value: number, i: number) => {
      const point = {
        benchmark: b.name,
        value: value,
        iteration: i,
        isBaseline: b.isBaseline,
      };
      allSamples.push(point);
      timeSeries.push(point);
    });
  });

  return { allSamples, timeSeries };
}

function createGroupLayout(groupId: string): string {
  return `
    <div class="plot-grid">
      <div class="plot-container">
        <div class="plot-title">Sample Time Series</div>
        <div class="plot-description">Execution time for each sample in collection order</div>
        <div id="timeseries-${groupId}" class="plot-area">
          <div class="loading">Loading time series...</div>
        </div>
      </div>
      
      <div class="plot-container">
        <div class="plot-title">Distribution Histogram</div>
        <div class="plot-description">Frequency distribution of execution times</div>
        <div id="histogram-${groupId}" class="plot-area">
          <div class="loading">Loading histogram...</div>
        </div>
      </div>
    </div>
    
    <div class="plot-grid" id="qq-plots-${groupId}">
      <!-- Q-Q plots will be inserted here -->
    </div>
    
    <div id="stats-${groupId}" style="margin-top: 20px;">
      <!-- Statistics will be inserted here -->
    </div>
  `;
}

function createStatCard(label: string, value: string): string {
  return `
    <div style="background: white; padding: 10px; border-radius: 4px; text-align: center;">
      <div style="font-size: 12px; color: #666; text-transform: uppercase;">${label}</div>
      <div style="font-size: 18px; font-weight: 600; color: #333;">${value}</div>
    </div>
  `;
}

function createStatsHTML(benchmark: ProcessedBenchmark): string {
  const stats = benchmark.stats;
  return `
    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
      <h4 style="margin-bottom: 10px; color: #333;">${benchmark.name}</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
        ${createStatCard("Min", `${stats.min.toFixed(3)}ms`)}
        ${createStatCard("Median", `${stats.p50.toFixed(3)}ms`)}
        ${createStatCard("Mean", `${stats.mean.toFixed(3)}ms`)}
        ${createStatCard("Max", `${stats.max.toFixed(3)}ms`)}
        ${createStatCard("P75", `${stats.p75.toFixed(3)}ms`)}
        ${createStatCard("P99", `${stats.p99.toFixed(3)}ms`)}
      </div>
    </div>
  `;
}
