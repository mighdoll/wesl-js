import * as Plot from '@observablehq/plot';
import * as d3 from 'd3';
import type { PlotDataPoint } from '../types.ts';

export class HistogramChart {
  private container: HTMLElement;
  
  constructor(container: HTMLElement) {
    this.container = container;
  }
  
  render(allSamples: PlotDataPoint[], benchmarkNames: string[]): void {
    // Clear previous content
    this.container.innerHTML = '';
    
    if (allSamples.length === 0) {
      this.container.innerHTML = '<div class="error">No sample data available</div>';
      return;
    }
    
    try {
      // Calculate better bin thresholds based on data range
      const values = allSamples.map(d => d.value);
      const min = d3.min(values)!;
      const max = d3.max(values)!;
      const q1 = d3.quantile(values.sort((a, b) => a - b), 0.25)!;
      const q3 = d3.quantile(values, 0.75)!;
      const iqr = q3 - q1;
      
      // Focus on the main data range, excluding extreme outliers
      const binMin = Math.max(min, q1 - 1.5 * iqr);
      const binMax = Math.min(max, q3 + 1.5 * iqr);
      
      // Create bins for each benchmark separately
      const bins = d3.ticks(binMin, binMax, 25);
      const binWidth = (bins[1] - bins[0]) * 0.8; // Leave space between groups
      const barWidth = binWidth / benchmarkNames.length;
      
      // Bin data for each benchmark
      const binnedData = benchmarkNames.map((benchmarkName, benchIndex) => {
        const benchmarkSamples = allSamples.filter(d => d.benchmark === benchmarkName);
        const histogram = d3.bin()
          .domain([binMin, binMax])
          .thresholds(bins)
          (benchmarkSamples.map(d => d.value));
          
        return histogram.map(bin => ({
          bin: bin.x0!,
          count: bin.length,
          benchmark: benchmarkName,
          benchmarkIndex: benchIndex,
          x: bin.x0! + (benchIndex - (benchmarkNames.length - 1) / 2) * barWidth
        })).filter(d => d.count > 0);
      }).flat();
      
      // Calculate max count for y-axis domain
      const maxCount = d3.max(binnedData, d => d.count) || 10;
      
      const plot = Plot.plot({
        marginLeft: 70,
        marginRight: 110,
        marginBottom: 60,
        width: 550,
        height: 300,
        style: { fontSize: "12px" },
        x: { 
          label: "Time (ms)", 
          labelAnchor: "center",
          domain: [binMin, binMax], 
          labelOffset: 45,
          labelArrow: "none",
          tickFormat: d => d.toFixed(1)
        },
        y: { 
          label: "Count", 
          labelAnchor: "center", 
          labelArrow: "none", 
          grid: true, 
          labelOffset: 50,
          domain: [0, maxCount * 1.1]
        },
        color: { 
          legend: false, 
          domain: benchmarkNames,
          scheme: "observable10"
        },
        marks: [
          // Parallel bars
          Plot.rect(
            binnedData,
            {
              x1: d => d.x - barWidth/2,
              x2: d => d.x + barWidth/2,
              y1: 0,
              y2: "count",
              fill: "benchmark",
              fillOpacity: 0.7,
              stroke: "white",
              strokeWidth: 0.5
            }
          ),
          Plot.ruleY([0]),
          
          // Legend background box - position relative to data range
          Plot.rect([{
            x1: binMin + (binMax - binMin) * 0.65, 
            x2: binMin + (binMax - binMin) * 1.05,
            y1: maxCount * 0.82,
            y2: maxCount * 1.0
          }], {
            x1: "x1", x2: "x2", y1: "y1", y2: "y2",
            fill: "#f8f8f8", fillOpacity: 0.7, stroke: "none"
          }),
          
          // Legend items - sort so main benchmark is first, baseline second
          ...benchmarkNames.sort((a, b) => {
            const aBaseline = a.includes("(baseline)");
            const bBaseline = b.includes("(baseline)");
            if (!aBaseline && bBaseline) return -1;
            if (aBaseline && !bBaseline) return 1;
            return 0;
          }).map((name, i) => {
            const isBaseline = name.includes("(baseline)");
            const color = d3.schemeObservable10[benchmarkNames.indexOf(name) % d3.schemeObservable10.length];
            const legendY = maxCount * 0.95 - i * (maxCount * 0.08);
            const legendX = binMin + (binMax - binMin) * 0.68;
            
            return Plot.rect([{x1: legendX, x2: legendX + (binMax - binMin) * 0.08, y1: legendY - maxCount * 0.025, y2: legendY + maxCount * 0.025}], {
              x1: "x1", x2: "x2", y1: "y1", y2: "y2",
              fill: color, fillOpacity: 0.7
            });
          }),
          
          // Legend text
          ...benchmarkNames.sort((a, b) => {
            const aBaseline = a.includes("(baseline)");
            const bBaseline = b.includes("(baseline)");
            if (!aBaseline && bBaseline) return -1;
            if (aBaseline && !bBaseline) return 1;
            return 0;
          }).map((name, i) => {
            const legendY = maxCount * 0.95 - i * (maxCount * 0.08);
            const legendX = binMin + (binMax - binMin) * 0.78;
            
            return Plot.text([{x: legendX, y: legendY, text: name}], {
              x: "x", y: "y", text: "text", fontSize: 12, textAnchor: "start", fill: "#333"
            });
          })
        ]
      });
      
      this.container.appendChild(plot);
    } catch (error) {
      console.error('Error rendering histogram:', error);
      this.container.innerHTML = `<div class="error">Error rendering histogram: ${error.message}</div>`;
    }
  }
}