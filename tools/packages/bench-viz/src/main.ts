import { renderHistogramChart } from "./components/HistogramChart.ts";
import { renderQQPlotChart } from "./components/QQPlotChart.ts";
import { renderTimeSeriesChart } from "./components/TimeSeriesChart.ts";
import { BenchmarkDataSource } from "./data/BenchmarkDataSource.ts";
import { calculateQQData } from "./stats/StatisticalUtils.ts";
import type { BenchmarkData, PlotDataPoint } from "./types.ts";

interface ProcessedBenchmark {
  name: string;
  samples: number[];
  stats: any;
  isBaseline: boolean;
}

function prepareBenchmarkData(group: any): ProcessedBenchmark[] {
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

function createPlotData(benchmarks: ProcessedBenchmark[]): {
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

function createGroupHTML(groupId: string): string {
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

function createStatisticCard(label: string, value: string): string {
  return `
    <div style="background: white; padding: 10px; border-radius: 4px; text-align: center;">
      <div style="font-size: 12px; color: #666; text-transform: uppercase;">${label}</div>
      <div style="font-size: 18px; font-weight: 600; color: #333;">${value}</div>
    </div>
  `;
}

function createBenchmarkStatsHTML(benchmark: ProcessedBenchmark): string {
  const stats = benchmark.stats;
  return `
    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
      <h4 style="margin-bottom: 10px; color: #333;">${benchmark.name}</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
        ${createStatisticCard("Min", `${stats.min.toFixed(3)}ms`)}
        ${createStatisticCard("Median", `${stats.p50.toFixed(3)}ms`)}
        ${createStatisticCard("Mean", `${stats.mean.toFixed(3)}ms`)}
        ${createStatisticCard("Max", `${stats.max.toFixed(3)}ms`)}
        ${createStatisticCard("P75", `${stats.p75.toFixed(3)}ms`)}
        ${createStatisticCard("P99", `${stats.p99.toFixed(3)}ms`)}
      </div>
    </div>
  `;
}

class BenchmarkVisualizationApp {
  private dataSource: BenchmarkDataSource;
  private appContainer: HTMLElement;
  private metadataContainer: HTMLElement;

  constructor() {
    this.dataSource = new BenchmarkDataSource("./data/benchmark-results.json");
    this.appContainer = document.getElementById("app")!;
    this.metadataContainer = document.getElementById("metadata")!;

    // Subscribe to data updates
    this.dataSource.subscribe(this.onDataUpdate.bind(this));

    // Start polling for data
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
      // Create suite container
      const suiteContainer = document.createElement("div");
      // Skip rendering suite name since it's redundant with header
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
    groupContainer.innerHTML = createGroupHTML(groupId);
    this.appContainer.appendChild(groupContainer);

    const benchmarks = prepareBenchmarkData(group);
    const { allSamples, timeSeries } = createPlotData(benchmarks);
    const benchmarkNames = benchmarks.map(b => b.name);

    this.renderTimeSeriesChart(groupId, timeSeries);
    this.renderHistogramChart(groupId, allSamples, benchmarkNames);
    this.renderQQPlots(
      groupId,
      benchmarks.filter(b => !b.isBaseline),
    );
    this.renderStatistics(groupId, benchmarks);
  }

  private renderTimeSeriesChart(
    groupId: string,
    timeSeries: PlotDataPoint[],
  ): void {
    const container = document.getElementById(`timeseries-${groupId}`);
    if (!container) return;

    renderTimeSeriesChart(container, timeSeries);
  }

  private renderHistogramChart(
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

    // Create Q-Q plots for each non-baseline benchmark
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

      // Render Q-Q plot
      const qqContainer = document.getElementById(`qq-${groupId}-${i}`);
      if (qqContainer) {
        const qqData = calculateQQData(benchmark.samples);
        renderQQPlotChart(qqContainer, qqData, benchmark.name);
      }
    });
  }

  private renderStatistics(
    groupId: string,
    benchmarks: ProcessedBenchmark[],
  ): void {
    const container = document.getElementById(`stats-${groupId}`);
    if (!container) return;

    container.innerHTML = benchmarks.map(createBenchmarkStatsHTML).join("");
  }
}

// Initialize the application when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new BenchmarkVisualizationApp();
});
