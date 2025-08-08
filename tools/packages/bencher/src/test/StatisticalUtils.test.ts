import { expect, test } from "vitest";
import {
  average,
  bootstrapMedian,
  coefficientOfVariation,
  detectOutliers,
  medianAbsoluteDeviation,
  percentile,
  standardDeviation,
} from "../StatisticalUtils.ts";

test("average calculates correctly", () => {
  expect(average([1, 2, 3, 4, 5])).toBe(3);
  expect(average([10])).toBe(10);
  expect(average([-5, 5])).toBe(0);
});

test("standardDeviation calculates correctly", () => {
  // For [1,2,3,4,5]: mean=3, variance=2, stddev=√2≈1.414
  const result = standardDeviation([1, 2, 3, 4, 5]);
  expect(result).toBeCloseTo(Math.sqrt(2), 3);

  // No variation
  expect(standardDeviation([5, 5, 5])).toBe(0);
});

test("percentile calculates correctly", () => {
  const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  expect(percentile(data, 0.5)).toBe(5); // median
  expect(percentile(data, 0.25)).toBe(3); // Q1
  expect(percentile(data, 0.75)).toBe(8); // Q3
  expect(percentile(data, 1.0)).toBe(10); // max
  expect(percentile([42], 0.5)).toBe(42); // single value
});

test("coefficientOfVariation handles edge cases", () => {
  // Normal case: stddev/mean
  // For [10, 20, 30]: mean=20, variance=66.67, stddev=8.165, cv=0.408
  const cv1 = coefficientOfVariation([10, 20, 30]);
  expect(cv1).toBeCloseTo(0.408, 2);

  // Zero mean edge case
  expect(coefficientOfVariation([-1, 0, 1])).toBe(0);

  // No variation
  expect(coefficientOfVariation([5, 5, 5])).toBe(0);
});

test("medianAbsoluteDeviation calculates correctly", () => {
  // For [1,2,3,4,5]: median=3, deviations=[2,1,0,1,2], MAD=1
  expect(medianAbsoluteDeviation([1, 2, 3, 4, 5])).toBe(1);

  // With outliers
  const dataWithOutliers = [1, 2, 3, 4, 5, 100];
  const mad = medianAbsoluteDeviation(dataWithOutliers);
  expect(mad).toBeGreaterThan(0);
  expect(mad).toBeLessThan(50); // Should be robust to outlier
});

test("detectOutliers identifies outliers correctly", () => {
  // No outliers in normal data
  const normalData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const normalResult = detectOutliers(normalData);
  expect(normalResult.outlierRate).toBe(0);
  expect(normalResult.outlierIndices).toHaveLength(0);

  // Clear outliers
  const dataWithOutliers = [1, 2, 3, 4, 5, 100]; // 100 is an outlier
  const outlierResult = detectOutliers(dataWithOutliers);
  expect(outlierResult.outlierRate).toBeGreaterThan(0);
  expect(outlierResult.outlierIndices).toContain(5); // Index of 100
});

test("bootstrapMedian confidence interval contains true median", () => {
  const data = Array.from({ length: 100 }, (_, i) => i); // 0-99
  const trueMedian = 49.5;

  const result = bootstrapMedian(data, 1000); // Fewer resamples for speed

  expect(result.estimate).toBeCloseTo(49, 1);
  expect(result.ci[0]).toBeLessThan(trueMedian);
  expect(result.ci[1]).toBeGreaterThan(trueMedian);
  expect(result.samples).toHaveLength(1000);
});
