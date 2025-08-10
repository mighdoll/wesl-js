import * as d3 from "d3";

export interface BenchmarkStyle {
  color: string;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  fillOpacity: number;
  strokeOpacity: number;
  isBaseline: boolean;
}

export function getBenchmarkStyles(benchmarkNames: string[]): Map<string, BenchmarkStyle> {
  const styles = new Map<string, BenchmarkStyle>();
  
  benchmarkNames.forEach((name, index) => {
    const isBaseline = name.includes("(baseline)");
    
    if (isBaseline) {
      // Baseline style: hollow orange circles/rectangles
      styles.set(name, {
        color: "#ffa500",
        fillColor: "none",
        strokeColor: "#ffa500", 
        strokeWidth: 2,
        fillOpacity: 0,
        strokeOpacity: 0.8,
        isBaseline: true
      });
    } else {
      // Main benchmark: filled blue circles/rectangles
      const baseColor = "#4682b4";
      styles.set(name, {
        color: baseColor,
        fillColor: baseColor,
        strokeColor: baseColor,
        strokeWidth: 0,
        fillOpacity: 0.8,
        strokeOpacity: 0.8,
        isBaseline: false
      });
    }
  });
  
  return styles;
}

export function createLegendData(benchmarkNames: string[]) {
  const styles = getBenchmarkStyles(benchmarkNames);
  
  return benchmarkNames
    .sort((a, b) => {
      const aBaseline = a.includes("(baseline)");
      const bBaseline = b.includes("(baseline)");
      if (!aBaseline && bBaseline) return -1;
      if (aBaseline && !bBaseline) return 1;
      return 0;
    })
    .map(name => ({
      name,
      style: styles.get(name)!
    }));
}