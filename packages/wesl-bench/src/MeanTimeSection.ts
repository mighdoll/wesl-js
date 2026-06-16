import {
  type MeasuredResults,
  mean,
  type ScalarSection,
  scalarSection,
  timeMs,
} from "benchforge";

/** Mean iteration time, shown as a single scalar value per run (no CI chart),
 *  grouped with run-count rather than the lines/sec throughput section (which
 *  is the verdict metric). */
export const meanTimeSection: ScalarSection = scalarSection({
  title: "time",
  rows: [
    {
      key: "meanTime",
      title: "mean",
      formatter: timeMs,
      comparable: true,
      value: (r: MeasuredResults) =>
        r.samples.length ? mean(r.samples) : undefined,
    },
  ],
});
