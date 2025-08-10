import type { QQPoint, OutlierInfo } from '../types.ts';

/** Calculate Q-Q plot data points for normality testing */
export function calculateQQData(samples: number[]): QQPoint[] {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = calculateMean(sorted);
  const stdDev = calculateStdDev(sorted, mean);

  // Standardize the samples to compare against standard normal
  const standardized = sorted.map(x => (x - mean) / stdDev);

  return standardized.map((value, i) => {
    const p = (i + 0.5) / n;
    const theoretical = normalInverse(p, 0, 1); // Standard normal
    return { 
      sample: value * stdDev + mean, // Convert back to original scale
      theoretical: theoretical * stdDev + mean
    };
  });
}

/** Detect outliers using IQR method */
export function detectOutliers(samples: number[]): OutlierInfo {
  const sorted = [...samples].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const outliers = samples
    .map((value, iteration) => ({ value, iteration }))
    .filter(d => d.value < lowerBound || d.value > upperBound);

  return { outliers, lowerBound, upperBound };
}

/** Calculate mean of array */
function calculateMean(values: number[]): number {
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/** Calculate standard deviation */
function calculateStdDev(values: number[], mean?: number): number {
  const m = mean ?? calculateMean(values);
  const squaredDiffs = values.map(val => (val - m) ** 2);
  const variance =
    squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(variance);
}

/** Calculate percentile value */
function percentile(sorted: number[], p: number): number {
  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (lower === upper) {
    return sorted[lower];
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/** Normal inverse cumulative distribution function (approximation) */
function normalInverse(p: number, mean: number, stdDev: number): number {
  const a1 = -3.969683028665376e1;
  const a2 = 2.209460984245205e2;
  const a3 = -2.759285104469687e2;
  const a4 = 1.38357751867269e2;
  const a5 = -3.066479806614716e1;
  const a6 = 2.506628277459239;

  const b1 = -5.447609879822406e1;
  const b2 = 1.615858368580409e2;
  const b3 = -1.556989798598866e2;
  const b4 = 6.680131188771972e1;
  const b5 = -1.328068155288572e1;

  const c1 = -7.784894002430293e-3;
  const c2 = -3.223964580411365e-1;
  const c3 = -2.400758277161838;
  const c4 = -2.549732539343734;
  const c5 = 4.374664141464968;
  const c6 = 2.938163982698783;

  const d1 = 7.784695709041462e-3;
  const d2 = 3.224671290700398e-1;
  const d3 = 2.445134137142996;
  const d4 = 3.754408661907416;

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    const z =
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
    return mean + stdDev * z;
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    const z =
      ((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
    return mean + stdDev * z;
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    const z =
      -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
    return mean + stdDev * z;
  }
}