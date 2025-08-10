import * as Plot from '@observablehq/plot';
import type { QQPoint } from '../types.ts';

export class QQPlotChart {
  private container: HTMLElement;
  
  constructor(container: HTMLElement) {
    this.container = container;
  }
  
  render(qqData: QQPoint[], benchmarkName: string): void {
    // Clear previous content
    this.container.innerHTML = '';
    
    if (qqData.length === 0) {
      this.container.innerHTML = '<div class="error">No Q-Q plot data available</div>';
      return;
    }
    
    try {
      const minVal = Math.min(...qqData.map(d => Math.min(d.theoretical, d.sample)));
      const maxVal = Math.max(...qqData.map(d => Math.max(d.theoretical, d.sample)));
      
      // Smart formatting for Q-Q plot axes - use milliseconds
      const formatQQ = (d: number): string => {
        if (Math.abs(d) < 0.1) return d.toFixed(3);
        if (Math.abs(d) < 10) return d.toFixed(2);
        return d.toFixed(1);
      };
      
      const plot = Plot.plot({
        marginLeft: 80,
        marginBottom: 60,
        marginRight: 50,
        width: 400,
        height: 400,
        aspectRatio: 1,
        style: { fontSize: "12px" },
        x: { 
          label: "Theoretical Quantiles (ms)", 
          labelAnchor: "center",
          domain: [minVal, maxVal], 
          labelOffset: 45,
          labelArrow: "none",
          tickFormat: formatQQ
        },
        y: { 
          label: "Sample Quantiles (ms)", 
          labelAnchor: "center", 
          labelArrow: "none",
          domain: [minVal, maxVal], 
          labelOffset: 60,
          tickFormat: formatQQ
        },
        marks: [
          Plot.line(
            [[minVal, minVal], [maxVal, maxVal]],
            { stroke: "gray", strokeDasharray: "4,2" }
          ),
          Plot.dot(
            qqData,
            { 
              x: "theoretical", 
              y: "sample",
              fill: "steelblue",
              title: d => `Sample: ${formatQQ(d.sample)}`
            }
          ),
          // Remove the benchmark name label
        ]
      });
      
      this.container.appendChild(plot);
    } catch (error) {
      console.error('Error rendering Q-Q plot:', error);
      this.container.innerHTML = `<div class="error">Error rendering Q-Q plot: ${error instanceof Error ? error.message : String(error)}</div>`;
    }
  }
}