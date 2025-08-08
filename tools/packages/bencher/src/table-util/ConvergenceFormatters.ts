const lowConfidenceThreshold = 80;
const redColorCode = "\x1b[31m";
const resetColorCode = "\x1b[0m";

/** @return formatted convergence percentage with color indicator */
export function formatConvergence(v: unknown): string {
  if (typeof v !== "number") return "";
  const pct = `${Math.round(v)}%`;
  return v < lowConfidenceThreshold
    ? `${redColorCode}${pct}${resetColorCode}`
    : pct;
}

/** @return formatted coefficient of variation as percentage */
export function formatCoefficientOfVariation(v: unknown): string {
  if (typeof v !== "number") return "";
  return `±${(v * 100).toFixed(1)}%`;
}
