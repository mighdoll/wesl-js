import { expect, test } from "vitest";
import type { BenchSuite } from "../Benchmark.ts";
import { parseBenchArgs, runBenchmarks } from "../cli/RunBenchCLI.ts";

test("adaptive mode reports statistical metrics correctly", async () => {
  const suite: BenchSuite = {
    name: "Statistical Test Suite",
    groups: [
      {
        name: "Test Group",
        benchmarks: [
          {
            name: "stable-benchmark",
            fn: () => {
              // Stable operation
              let sum = 0;
              for (let i = 0; i < 100; i++) {
                sum += i;
              }
              return sum;
            },
          },
          {
            name: "variable-benchmark",
            fn: () => {
              // Variable operation with some outliers
              const iterations = Math.random() > 0.9 ? 1000 : 100;
              let sum = 0;
              for (let i = 0; i < iterations; i++) {
                sum += i;
              }
              return sum;
            },
          },
        ],
      },
    ],
  };

  // Parse args with adaptive mode
  const args = parseBenchArgs(() => ({
    adaptive: true,
    time: 0.1, // Short time for testing
    "max-time": 1, // 1 second max
  }));

  const results = await runBenchmarks(suite, args);

  expect(results).toHaveLength(1);
  expect(results[0].reports).toHaveLength(2);

  for (const report of results[0].reports) {
    const { measuredResults } = report;

    // Verify statistical metrics are present
    expect(measuredResults.time).toBeDefined();

    // Check new percentiles
    expect(measuredResults.time?.p25).toBeDefined();
    expect(measuredResults.time?.p50).toBeDefined();
    expect(measuredResults.time?.p75).toBeDefined();
    expect(measuredResults.time?.p95).toBeDefined();

    // Check statistical measures
    expect(measuredResults.time?.cv).toBeDefined();
    expect(measuredResults.time?.cv).toBeGreaterThanOrEqual(0);

    expect(measuredResults.time?.mad).toBeDefined();
    expect(measuredResults.time?.mad).toBeGreaterThanOrEqual(0);

    expect(measuredResults.time?.outlierRate).toBeDefined();
    expect(measuredResults.time?.outlierRate).toBeGreaterThanOrEqual(0);
    expect(measuredResults.time?.outlierRate).toBeLessThanOrEqual(1);

    // Check convergence info
    expect(measuredResults.convergence).toBeDefined();
    expect(measuredResults.convergence?.confidence).toBeGreaterThanOrEqual(0);
    expect(measuredResults.convergence?.confidence).toBeLessThanOrEqual(100);
    expect(measuredResults.convergence?.reason).toBeDefined();

    // Verify percentiles are ordered correctly
    if (
      measuredResults.time?.p25 &&
      measuredResults.time?.p50 &&
      measuredResults.time?.p75 &&
      measuredResults.time?.p95
    ) {
      expect(measuredResults.time.p25).toBeLessThanOrEqual(
        measuredResults.time.p50,
      );
      expect(measuredResults.time.p50).toBeLessThanOrEqual(
        measuredResults.time.p75,
      );
      expect(measuredResults.time.p75).toBeLessThanOrEqual(
        measuredResults.time.p95,
      );
    }
  }

  // The variable benchmark should have higher CV
  const stableResult = results[0].reports.find(
    r => r.name === "stable-benchmark",
  );
  const variableResult = results[0].reports.find(
    r => r.name === "variable-benchmark",
  );

  if (
    stableResult?.measuredResults.time?.cv &&
    variableResult?.measuredResults.time?.cv
  ) {
    expect(variableResult.measuredResults.time.cv).toBeGreaterThanOrEqual(
      stableResult.measuredResults.time.cv,
    );
  }
}, 20000);

test("adaptive mode handles GC-heavy workload", async () => {
  const suite: BenchSuite = {
    name: "GC Test Suite",
    groups: [
      {
        name: "Memory Group",
        benchmarks: [
          {
            name: "gc-heavy",
            fn: () => {
              // Allocate memory to potentially trigger GC
              const arrays = [];
              for (let i = 0; i < 50; i++) {
                arrays.push(Array.from({ length: 1000 }, () => Math.random()));
              }
              return arrays.length;
            },
          },
        ],
      },
    ],
  };

  const args = parseBenchArgs(() => ({
    adaptive: true,
    time: 0.1,
    "max-time": 2,
  }));

  const results = await runBenchmarks(suite, args);

  expect(results).toHaveLength(1);
  expect(results[0].reports).toHaveLength(1);

  const gcResult = results[0].reports[0].measuredResults;

  // Should converge despite potential GC spikes
  expect(gcResult.convergence).toBeDefined();

  // Should detect outliers if GC occurred
  expect(gcResult.time?.outlierRate).toBeDefined();

  // CV might be higher due to GC
  expect(gcResult.time?.cv).toBeDefined();

  // MAD should be robust to outliers
  expect(gcResult.time?.mad).toBeDefined();
  if (gcResult.time?.mad && gcResult.time?.cv) {
    // MAD should be more stable than standard deviation-based CV
    expect(gcResult.time.mad).toBeGreaterThanOrEqual(0);
  }
}, 20000);
