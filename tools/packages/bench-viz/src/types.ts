/** Root benchmark data from JSON output */
export interface BenchmarkData {
  meta: {
    timestamp: string;
    version: string;
    args: Record<string, any>;
    environment: {
      node: string;
      platform: string;
      arch?: string;
    };
  };
  suites: BenchmarkSuite[];
}

export interface BenchmarkSuite {
  name: string;
  groups: BenchmarkGroup[];
}

export interface BenchmarkGroup {
  name: string;
  baseline?: BenchmarkResult;
  benchmarks: BenchmarkResult[];
}

export interface BenchmarkResult {
  name: string;
  status: "completed" | "running" | "failed";

  samples: number[]; // milliseconds
  time: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p75: number;
    p99: number;
    p999: number;
  };

  heapSize?: {
    min: number;
    max: number;
    mean: number;
  };

  gcTime?: {
    min: number;
    max: number;
    mean: number;
  };

  cpu?: {
    instructions?: number;
    cycles?: number;
    cacheMisses?: number;
    branchMisses?: number;
  };

  execution: {
    iterations: number;
    totalTime: number;
    warmupRuns?: number;
  };

  adaptive?: {
    confidenceInterval: {
      lower: number;
      upper: number;
      margin: number;
      marginPercent: number;
      confidence: number;
    };
    converged: boolean;
    stopReason: "threshold_met" | "max_time" | "max_iterations";
  };

  error?: {
    message: string;
    type: string;
    stackTrace?: string;
  };
}

export interface PlotDataPoint {
  benchmark: string;
  value: number;
  iteration: number;
  isBaseline?: boolean;
}

export interface QQPoint {
  sample: number;
  theoretical: number;
}

export interface OutlierInfo {
  outliers: Array<{ value: number; iteration: number }>;
  lowerBound: number;
  upperBound: number;
}
