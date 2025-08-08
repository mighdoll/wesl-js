import {
  integer,
  type MeasuredResults,
  type ReportColumnGroup,
  type ResultsMapper,
} from "bencher";

/** @return formatted coefficient of variation as percentage */
function formatCoefficientOfVariation(v: unknown): string {
  return typeof v === "number" ? `±${(v * 100).toFixed(1)}%` : "";
}

/** @return formatted convergence percentage with color indicator */
function formatConvergence(v: unknown): string {
  if (typeof v !== "number") return "";
  const pct = `${Math.round(v)}%`;
  return v < 80 ? `\x1b[31m${pct}\x1b[0m` : pct;
}

/** Lines of code throughput with statistical metrics */
export interface AdaptiveLocStats {
  lines?: number;
  locSecMean?: number;
  locCV?: number; // coefficient of variation
  locSecP50?: number;
  confidence?: number; // convergence confidence
}

export const adaptiveLocSection: ResultsMapper<AdaptiveLocStats> = {
  extract: (results: MeasuredResults, metadata?: any) => {
    const lines = metadata?.linesOfCode || 0;

    const locSecMean = results.time?.avg
      ? lines / (results.time.avg / 1000)
      : undefined;

    const locSecP50 = results.time?.p50
      ? lines / (results.time.p50 / 1000)
      : undefined;

    // Use coefficient of variation from statistical improvements
    const locCV = results.time?.cv;

    // Use convergence confidence
    const confidence = results.convergence?.confidence;

    return { lines, locSecMean, locCV, locSecP50, confidence };
  },
  columns: (): ReportColumnGroup<AdaptiveLocStats>[] => [
    {
      groupTitle: "lines / sec",
      columns: [
        {
          key: "locSecMean",
          title: "mean",
          formatter: integer,
          comparable: true,
        },
        {
          key: "locCV",
          title: "±CV",
          formatter: formatCoefficientOfVariation,
        },
        {
          key: "locSecP50",
          title: "p50",
          formatter: integer,
          comparable: true,
        },
        {
          key: "lines",
          title: "lines",
          formatter: integer,
        },
      ],
    },
    {
      groupTitle: "confidence",
      columns: [
        {
          key: "confidence",
          title: "converged",
          formatter: formatConvergence,
        },
      ],
    },
  ],
};
