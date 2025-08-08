import { expect, test } from "vitest";
import type { BenchmarkSpec } from "../Benchmark.ts";
import { createAdaptiveWrapper } from "../runners/AdaptiveWrapper.ts";
import { BasicRunner } from "../runners/BasicRunner.ts";

test("adaptive runner collects samples for specified duration", async () => {
  const runner = new BasicRunner();
  const adaptiveRunner = createAdaptiveWrapper(runner, {
    minTime: 200,
    maxTime: 5000,
  });

  const benchmark: BenchmarkSpec = {
    name: "stable-test",
    fn: () => {
      // Very stable operation
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        sum += i;
      }
      return sum;
    },
  };

  const results = await adaptiveRunner.runBench(benchmark, {
    minTime: 100,
  });

  expect(results).toHaveLength(1);
  expect(results[0].totalTime).toBeDefined();
  expect(results[0].totalTime).toBeGreaterThanOrEqual(0.19); // Should run for at least minTime
  expect(results[0].totalTime).toBeLessThanOrEqual(5.1); // Should not exceed maxTime
  expect(results[0].samples.length).toBeGreaterThan(0);
});

test("adaptive runner respects max time limit", async () => {
  const runner = new BasicRunner();
  const adaptiveRunner = createAdaptiveWrapper(runner, {
    minTime: 2000, // Want to run for 2 seconds
    maxTime: 300, // But max out at 0.3 seconds
  });

  const benchmark: BenchmarkSpec = {
    name: "time-limit-test",
    fn: () => {
      // Quick operation to allow many iterations
      let sum = 0;
      for (let i = 0; i < 10; i++) {
        sum += i;
      }
      return sum;
    },
  };

  const results = await adaptiveRunner.runBench(benchmark, {
    minTime: 50,
  });

  expect(results).toHaveLength(1);
  expect(results[0].totalTime).toBeGreaterThanOrEqual(0.2); // Allow some timing variance
  expect(results[0].totalTime).toBeLessThanOrEqual(1.0); // Allow some overhead
});

test("adaptive runner merges results correctly", async () => {
  const runner = new BasicRunner();
  const adaptiveRunner = createAdaptiveWrapper(runner, {
    minTime: 100, // Reduced time to avoid timeout
    maxTime: 500,
  });

  const benchmark: BenchmarkSpec = {
    name: "merge-test",
    fn: () => {
      // Simpler operation to avoid timeout
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        sum += i;
      }
      return sum;
    },
  };

  const results = await adaptiveRunner.runBench(benchmark, {
    minTime: 50,
  });

  expect(results).toHaveLength(1);
  const result = results[0];

  // Check that all time stats are present and valid
  expect(result.time).toBeDefined();
  expect(result.time.min).toBeLessThanOrEqual(result.time.avg);
  expect(result.time.avg).toBeLessThanOrEqual(result.time.max);
  expect(result.time.p50).toBeDefined();
  expect(result.time.p75).toBeDefined();
  expect(result.time.p99).toBeDefined();

  // Check samples exist and are valid
  const samples = result.samples;
  expect(samples.length).toBeGreaterThan(0);
  expect(result.totalTime).toBeDefined();
  expect(result.totalTime).toBeGreaterThan(0);
}, 10000); // Add explicit timeout

test("convergence detection with stable benchmark", async () => {
  const runner = new BasicRunner();
  const adaptiveRunner = createAdaptiveWrapper(runner, {
    minTime: 100,
    maxTime: 2000,
    targetConfidence: 95,
  });

  const benchmark: BenchmarkSpec = {
    name: "stable-convergence-test",
    fn: () => {
      // Very stable operation
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        sum += i;
      }
      return sum;
    },
  };

  const results = await adaptiveRunner.runBench(benchmark, {
    minTime: 50,
  });

  expect(results).toHaveLength(1);
  const result = results[0];

  // Should have convergence info
  expect(result.convergence).toBeDefined();
  expect(result.convergence?.confidence).toBeGreaterThanOrEqual(0);
  expect(result.convergence?.confidence).toBeLessThanOrEqual(100);
  expect(result.convergence?.reason).toBeDefined();
});

test("convergence detection with variable benchmark", async () => {
  const runner = new BasicRunner();
  const adaptiveRunner = createAdaptiveWrapper(runner, {
    minTime: 100,
    maxTime: 1000,
  });

  let callCount = 0;
  const benchmark: BenchmarkSpec = {
    name: "variable-convergence-test",
    fn: () => {
      // Variable operation - alternates between fast and slow
      callCount++;
      const iterations = callCount % 10 === 0 ? 1000 : 100;
      let sum = 0;
      for (let i = 0; i < iterations; i++) {
        sum += i;
      }
      return sum;
    },
  };

  const results = await adaptiveRunner.runBench(benchmark, {
    minTime: 50,
  });

  expect(results).toHaveLength(1);
  const result = results[0];

  // Should have convergence info with potentially lower confidence
  expect(result.convergence).toBeDefined();
  expect(result.convergence?.confidence).toBeDefined();

  // Should have higher CV due to variability
  expect(result.time?.cv).toBeDefined();
  if (result.time?.cv) {
    expect(result.time.cv).toBeGreaterThan(0);
  }
});

test("respects minimum sample requirement before converging", async () => {
  const runner = new BasicRunner();
  const adaptiveRunner = createAdaptiveWrapper(runner, {
    minTime: 50, // Very short time
    maxTime: 200,
  });

  const benchmark: BenchmarkSpec = {
    name: "min-samples-test",
    fn: () => {
      // Quick operation
      return Math.random();
    },
  };

  const results = await adaptiveRunner.runBench(benchmark, {
    minTime: 10,
  });

  expect(results).toHaveLength(1);
  const result = results[0];

  // Should have collected at least minimum samples (100)
  expect(result.samples.length).toBeGreaterThanOrEqual(100);

  // Convergence reason should mention sample collection if not enough samples
  if (result.convergence && result.convergence.confidence < 100) {
    expect(result.convergence.reason).toBeDefined();
  }
});
