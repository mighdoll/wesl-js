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
      
      const plot = Plot.plot({
        marginLeft: 70,
        marginRight: 110,
        marginBottom: 60,
        width: 550,
        height: 300,
        style: { fontSize: "14px" },
        x: { 
          label: "Time (ms)", 
          domain: [binMin, binMax], 
          labelOffset: 45,
          tickFormat: d => d.toFixed(1)
        },
        y: { label: "Count", labelAnchor: "center", grid: true, labelOffset: 50 },
        color: { 
          legend: false, 
          domain: benchmarkNames,
          scheme: "observable10"
        },
        marks: [
          Plot.rectY(
            allSamples,
            Plot.binX(
              { y: "count" },
              { 
                x: "value", 
                fill: "benchmark",
                fillOpacity: 0.6,
                thresholds: d3.ticks(binMin, binMax, 25),
                inset: 1
              }
            )
          ),
          Plot.ruleY([0]),
          
          // Custom legend inside chart (upper right) - legend rectangles
          ...benchmarkNames.map((name, i) => {
            const color = d3.schemeObservable10[i % d3.schemeObservable10.length];
            const legendY = 15 - i * 2.5; // Static positioning from top
            const legendX = binMax * 0.7;
            
            return Plot.rect([{x1: legendX, x2: legendX + (binMax - binMin) * 0.08, y1: legendY, y2: legendY + 1.5}], {
              x1: "x1", x2: "x2", y1: "y1", y2: "y2",
              fill: color, fillOpacity: 0.6
            });
          }),
          // Custom legend inside chart (upper right) - legend text
          ...benchmarkNames.map((name, i) => {
            const legendY = 15.75 - i * 2.5; // Centered with rectangles  
            const legendX = binMax * 0.7 + (binMax - binMin) * 0.12;
            
            return Plot.text([{x: legendX, y: legendY, text: name}], {
              x: "x", y: "y", text: "text", fontSize: 11, textAnchor: "start", fill: "#333"
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