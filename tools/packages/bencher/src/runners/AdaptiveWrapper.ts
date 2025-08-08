import type { BenchmarkSpec } from "../Benchmark.ts";
import type { MeasuredResults } from "../MeasuredResults.ts";
import {
  average,
  coefficientOfVariation,
  detectOutliers,
  medianAbsoluteDeviation,
  percentile,
} from "../StatisticalUtils.ts";
import type { BenchRunner, RunnerOptions } from "./BenchRunner.ts";

const defaultMinTime = 1000;
const defaultMaxTime = 30000;
const defaultTargetConfidence = 95;
const fallbackConfidenceThreshold = 80;
const msToNanoseconds = 1_000_000;
const slidingWindowSize = 50;
const minSampleCount = 100;
const stabilityThreshold = 0.02;
const initialBatchTime = 100;
const continueBatchTime = 100;
const continueBatchIterations = 10;

interface ConvergenceResult {
  converged: boolean;
  confidence: number;
  reason: string;
}

export interface AdaptiveOptions extends RunnerOptions {
  adaptive?: boolean;
  minTime?: number;
  maxTime?: number;
  targetConfidence?: number;
}

/** @return runner that adapts sampling based on convergence */
export function createAdaptiveWrapper(
  baseRunner: BenchRunner,
  options: AdaptiveOptions,
): BenchRunner {
  return {
    async runBench<T = unknown>(
      benchmark: BenchmarkSpec<T>,
      runnerOptions: RunnerOptions,
      params?: T,
    ): Promise<MeasuredResults[]> {
      return runBench(baseRunner, benchmark, runnerOptions, options, params);
    },
  };
}

/** @return benchmark results with adaptive sampling */
async function runBench<T>(
  baseRunner: BenchRunner,
  benchmark: BenchmarkSpec<T>,
  runnerOptions: RunnerOptions,
  options: AdaptiveOptions,
  params?: T,
): Promise<MeasuredResults[]> {
  const {
    minTime = defaultMinTime,
    maxTime = defaultMaxTime,
    targetConfidence = defaultTargetConfidence,
  } = options;
  const allSamples: number[] = [];
  const startTime = performance.now();

  const results = await baseRunner.runBench(
    benchmark,
    {
      ...runnerOptions,
      minTime: Math.min(minTime, initialBatchTime),
      maxIterations: undefined,
    },
    params,
  );

  collectSamples(results[0], allSamples);

  while (performance.now() - startTime < maxTime) {
    const convergence = checkConvergence(allSamples);

    if (convergence.converged && convergence.confidence >= targetConfidence) {
      break;
    }

    if (
      performance.now() - startTime >= minTime &&
      convergence.confidence >= fallbackConfidenceThreshold
    ) {
      break;
    }

    const batchResults = await baseRunner.runBench(
      benchmark,
      {
        ...runnerOptions,
        minTime: continueBatchTime,
        maxIterations: continueBatchIterations,
      },
      params,
    );

    collectSamples(batchResults[0], allSamples);
  }

  const convergence = checkConvergence(allSamples);
  return buildFinalResults(results[0], allSamples, startTime, convergence);
}

/** Append new samples to collection */
function collectSamples(result: MeasuredResults, samples: number[]): void {
  if (result.samples) {
    for (const sample of result.samples) {
      samples.push(sample);
    }
  }
}

/** @return final results with convergence statistics */
function buildFinalResults(
  result: MeasuredResults,
  samples: number[],
  startTime: number,
  convergence: ConvergenceResult,
): MeasuredResults[] {
  const totalTime = (performance.now() - startTime) / 1000;

  const samplesInMs = samples.map(s => s / msToNanoseconds);
  const timeStats =
    samples.length > 0 ? calculateTimeStatistics(samples) : result.time;

  return [
    {
      ...result,
      samples: samplesInMs,
      time: timeStats,
      totalTime,
      convergence,
    },
  ];
}

/** @return time statistics in milliseconds */
function calculateTimeStatistics(samples: number[]) {
  const samplesMs = samples.map(s => s / msToNanoseconds);
  const { min, max, sum } = computeBasicStats(samples);
  const percentiles = computePercentiles(samples);
  const robustMetrics = computeRobustMetrics(samplesMs);

  return {
    min: min / msToNanoseconds,
    max: max / msToNanoseconds,
    avg: sum / samples.length / msToNanoseconds,
    ...percentiles,
    ...robustMetrics,
  };
}

/** @return min, max, and sum using iterative approach */
function computeBasicStats(samples: number[]) {
  const min = samples.reduce(
    (a, b) => Math.min(a, b),
    Number.POSITIVE_INFINITY,
  );
  const max = samples.reduce(
    (a, b) => Math.max(a, b),
    Number.NEGATIVE_INFINITY,
  );
  const sum = samples.reduce((a, b) => a + b, 0);
  return { min, max, sum };
}

/** @return standard percentiles in milliseconds */
function computePercentiles(samples: number[]) {
  return {
    p25: percentile(samples, 0.25) / msToNanoseconds,
    p50: percentile(samples, 0.5) / msToNanoseconds,
    p75: percentile(samples, 0.75) / msToNanoseconds,
    p95: percentile(samples, 0.95) / msToNanoseconds,
    p99: percentile(samples, 0.99) / msToNanoseconds,
    p999: percentile(samples, 0.999) / msToNanoseconds,
  };
}

/** @return robust statistical metrics */
function computeRobustMetrics(samplesMs: number[]) {
  return {
    cv: coefficientOfVariation(samplesMs),
    mad: medianAbsoluteDeviation(samplesMs),
    outlierRate: detectOutliers(samplesMs).outlierRate,
  };
}

/** @return convergence status based on sliding window stability */
function checkConvergence(samples: number[]): ConvergenceResult {
  if (samples.length < minSampleCount) {
    return {
      converged: false,
      confidence: (samples.length / minSampleCount) * 100,
      reason: `Collecting samples: ${samples.length}/${minSampleCount}`,
    };
  }

  const drift = calculateDrift(samples);

  if (drift.mean > stabilityThreshold || drift.median > stabilityThreshold) {
    const confidence = Math.max(
      0,
      (1 - Math.max(drift.mean, drift.median) / stabilityThreshold) * 100,
    );
    return {
      converged: false,
      confidence,
      reason: `Drift detected: mean ${(drift.mean * 100).toFixed(1)}%, median ${(drift.median * 100).toFixed(1)}%`,
    };
  }

  return {
    converged: true,
    confidence: 100,
    reason: "Stable performance pattern",
  };
}

/** @return drift measurements between consecutive windows */
function calculateDrift(samples: number[]) {
  const window1 = samples.slice(-slidingWindowSize * 2, -slidingWindowSize);
  const window2 = samples.slice(-slidingWindowSize);

  const mean1 = average(window1);
  const mean2 = average(window2);
  const meanDrift = Math.abs(mean2 - mean1) / mean1;

  const median1 = percentile(window1, 0.5);
  const median2 = percentile(window2, 0.5);
  const medianDrift = Math.abs(median2 - median1) / median1;

  return { mean: meanDrift, median: medianDrift };
}
