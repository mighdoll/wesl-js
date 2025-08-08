import { expect, test } from "vitest";
import { expectTrimmedMatch } from "vitest-util";
import {
  type BenchmarkReport,
  reportResults,
  valuesForReports,
} from "../BenchmarkReport.ts";
import type { MeasuredResults } from "../MeasuredResults.ts";
import {
  adaptiveSection,
  gcSection,
  timeSection,
} from "../StandardSections.ts";

function createMockResults(
  overrides?: Partial<MeasuredResults>,
): MeasuredResults {
  return {
    name: "test",
    samples: [1, 2, 3],
    time: {
      min: 1.0,
      max: 3.0,
      avg: 1.5,
      p50: 1.4,
      p75: 1.8,
      p99: 2.1,
      p999: 2.5,
    },
    nodeGcTime: {
      inRun: 0.09,
      before: 0.01,
      after: 0.02,
      total: 0.12,
      collects: 3,
    },
    ...overrides,
  };
}

test("combines column sections correctly", () => {
  const sections = [timeSection, gcSection] as const;
  const reports: BenchmarkReport[] = [
    {
      name: "test",
      measuredResults: createMockResults(),
    },
  ];

  const rows = valuesForReports(reports, sections);

  expect(rows[0].name).toBe("test");
  expect(rows[0].mean).toBe(1.5);
  expect(rows[0].p50).toBe(1.4);
  expect(rows[0].p99).toBe(2.1);
  expect(rows[0].gc).toBeCloseTo(0.02, 2);
});

test("generates diff columns for baseline comparison", () => {
  const group1Reports: BenchmarkReport[] = [
    {
      name: "version1",
      measuredResults: createMockResults({
        time: { ...createMockResults().time!, avg: 1.5, p50: 1.45, p99: 2.0 },
      }),
    },
    {
      name: "version2",
      measuredResults: createMockResults({
        time: { ...createMockResults().time!, avg: 15.5, p50: 14.5, p99: 20.0 },
      }),
    },
  ];

  const baseline: BenchmarkReport = {
    name: "baseVersion",
    measuredResults: createMockResults({
      time: { ...createMockResults().time!, avg: 1.2, p50: 1.5, p99: 1.9 },
    }),
  };

  const group2Reports: BenchmarkReport[] = [
    {
      name: "test3",
      measuredResults: createMockResults({
        time: { ...createMockResults().time!, avg: 2.5, p50: 2.45, p99: 3.0 },
      }),
    },
    {
      name: "test4",
      measuredResults: createMockResults({
        time: { ...createMockResults().time!, avg: 3.5, p50: 3.45, p99: 4.0 },
      }),
    },
  ];

  const groups = [
    { reports: group1Reports, baseline: baseline },
    { reports: group2Reports },
  ];

  const table = reportResults(groups, [timeSection]);
  const expected = `
    ╔═════════════════╤══════════════════════════════════════════════╗
    ║                 │                     time                     ║
    ║                 │                                              ║
    ║ name            │ mean  Δ%        p50   Δ%       p99   Δ%      ║
    ╟─────────────────┼──────────────────────────────────────────────╢
    ║ version1        │ 1.50  +25.0%    1.45  -3.3%    2.00  +5.3%   ║
    ║ version2        │ 16    +1191.7%  15    +866.7%  20    +952.6% ║
    ║ --> baseVersion │ 1.20            1.50           1.90          ║
    ║                 │                                              ║
    ║ test3           │ 2.50            2.45           3.00          ║
    ║ test4           │ 3.50            3.45           4.00          ║
    ╚═════════════════╧══════════════════════════════════════════════╝`;
  expectTrimmedMatch(table, expected);
});

test("adaptive section formats statistics correctly", () => {
  const reports: BenchmarkReport[] = [
    {
      name: "test-adaptive",
      measuredResults: createMockResults({
        time: {
          min: 1.0,
          max: 3.0,
          avg: 1.5,
          p50: 1.4,
          p75: 1.8,
          p99: 2.1,
          p999: 2.5,
          cv: 0.234, // 23.4% coefficient of variation
          mad: 0.3,
          outlierRate: 0.05,
        },
        convergence: {
          converged: true,
          confidence: 95,
          reason: "Stable performance pattern",
        },
      }),
    },
    {
      name: "test-low-confidence",
      measuredResults: createMockResults({
        time: {
          min: 2.0,
          max: 8.0,
          avg: 4.5,
          p50: 4.0,
          p75: 5.8,
          p99: 7.5,
          p999: 7.9,
          cv: 0.456, // 45.6% high variation
        },
        convergence: {
          converged: false,
          confidence: 65,
          reason: "Drift detected",
        },
      }),
    },
  ];

  const sections = [adaptiveSection];
  const rows = valuesForReports(reports, sections);

  // Check CV formatting
  expect(rows[0].cv).toBe(0.234);
  expect(rows[1].cv).toBe(0.456);

  // Check confidence values
  expect(rows[0].confidence).toBe(95);
  expect(rows[1].confidence).toBe(65);

  // Generate and check formatted output
  const table = reportResults([{ reports }], sections);

  // CV should be formatted as percentage with ± symbol
  expect(table).toContain("±23.4%");
  expect(table).toContain("±45.6%");

  // Confidence should be shown as percentage
  expect(table).toContain("95%");
  // Low confidence (<80) should have color code (we can't test ANSI codes in snapshot but at least check the value)
  expect(table).toMatch(/65%/);
});
