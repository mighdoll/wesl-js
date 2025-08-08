/** @return coefficient of variation: stdDev / mean */
export function coefficientOfVariation(samples: number[]): number {
  const mean = average(samples);
  if (mean === 0) return 0;
  const stdDev = standardDeviation(samples);
  return stdDev / mean;
}

/** @return median absolute deviation - robust spread measure */
export function medianAbsoluteDeviation(samples: number[]): number {
  const median = percentile(samples, 0.5);
  const deviations = samples.map(x => Math.abs(x - median));
  return percentile(deviations, 0.5);
}

const outlierMultiplier = 1.5;
const defaultBootstrapSamples = 10000;
const defaultConfidence = 0.95;

/** @return outlier statistics using Tukey's IQR method */
export function detectOutliers(samples: number[]): {
  outlierRate: number;
  outlierIndices: number[];
} {
  const q1 = percentile(samples, 0.25);
  const q3 = percentile(samples, 0.75);
  const iqr = q3 - q1;
  const lowerBound = q1 - outlierMultiplier * iqr;
  const upperBound = q3 + outlierMultiplier * iqr;

  const outlierIndices = samples
    .map((v, i) => (v < lowerBound || v > upperBound ? i : -1))
    .filter(i => i >= 0);

  return {
    outlierRate: outlierIndices.length / samples.length,
    outlierIndices,
  };
}

/** @return arithmetic mean */
export function average(values: number[]): number {
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/** @return population standard deviation */
export function standardDeviation(samples: number[]): number {
  const mean = average(samples);
  const variance =
    samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / samples.length;
  return Math.sqrt(variance);
}

/** @return value at percentile p (0-1) using nearest-rank method */
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, index)];
}

export interface BootstrapResult {
  estimate: number;
  ci: [number, number];
  samples: number[];
}

/** @return bootstrap confidence interval for median estimate */
export function bootstrapMedian(
  samples: number[],
  nResamples = defaultBootstrapSamples,
  confidence = defaultConfidence,
): BootstrapResult {
  const medians: number[] = [];

  for (let i = 0; i < nResamples; i++) {
    const resample = [];
    for (let j = 0; j < samples.length; j++) {
      resample.push(samples[Math.floor(Math.random() * samples.length)]);
    }
    medians.push(percentile(resample, 0.5));
  }

  const alpha = (1 - confidence) / 2;
  const lower = percentile(medians, alpha);
  const upper = percentile(medians, 1 - alpha);

  return {
    estimate: percentile(samples, 0.5),
    ci: [lower, upper],
    samples: medians,
  };
}
