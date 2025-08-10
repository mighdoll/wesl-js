import * as Plot from '@observablehq/plot';
import * as d3 from 'd3';
import type { PlotDataPoint } from '../types.ts';

export class TimeSeriesChart {
  private container: HTMLElement;
  
  constructor(container: HTMLElement) {
    this.container = container;
  }
  
  render(timeSeries: PlotDataPoint[]): void {
    // Clear previous content
    this.container.innerHTML = '';
    
    if (timeSeries.length === 0) {
      this.container.innerHTML = '<div class="error">No time series data available</div>';
      return;
    }
    
    try {
      const benchmarks = [...new Set(timeSeries.map(d => d.benchmark))];
      
      // Keep values in original milliseconds and determine best unit
      const sampleData = timeSeries.map((d, i) => ({
        benchmark: d.benchmark,
        sample: i,
        value: d.value, // Keep in milliseconds
        isBaseline: d.isBaseline || d.benchmark.includes("(baseline)")
      }));
      
      // Determine appropriate time unit and conversion
      const allValues = sampleData.map(d => d.value);
      const minVal = d3.min(allValues)!;
      const maxVal = d3.max(allValues)!;
      const avgVal = d3.mean(allValues)!;
      
      let timeUnit: string, unitSuffix: string, convertValue: (ms: number) => number, formatValue: (d: number) => string;
      
      if (avgVal < 0.001) {
        // Nanoseconds
        timeUnit = "ns";
        unitSuffix = "ns";
        convertValue = (ms) => ms * 1000000;
        formatValue = d => d3.format(",.0f")(d);
      } else if (avgVal < 1) {
        // Microseconds
        timeUnit = "μs";
        unitSuffix = "μs"; 
        convertValue = (ms) => ms * 1000;
        formatValue = d => d3.format(",.1f")(d);
      } else {
        // Milliseconds
        timeUnit = "ms";
        unitSuffix = "ms";
        convertValue = (ms) => ms;
        formatValue = d => d3.format(",.1f")(d);
      }
      
      // Convert values for display
      const convertedData = sampleData.map(d => ({
        ...d,
        displayValue: convertValue(d.value)
      }));
      
      // Smart Y-axis range - don't start at 0
      const convertedValues = convertedData.map(d => d.displayValue);
      const dataMin = d3.min(convertedValues)!;
      const dataMax = d3.max(convertedValues)!;
      const dataRange = dataMax - dataMin;
      
      // Start Y-axis at ~10-20% below minimum value, but with nice round numbers
      const padding = Math.max(dataRange * 0.15, dataRange * 0.1);
      let yMin = dataMin - padding;
      
      // Round down to a nice number
      const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(yMin))));
      yMin = Math.floor(yMin / magnitude) * magnitude;
      
      // Ensure we don't go below 0 for positive data
      if (dataMin > 0 && yMin < 0) {
        yMin = 0;
      }
      
      const yMax = dataMax + (dataRange * 0.05);
      
      const plot = Plot.plot({
        marginLeft: 70,
        marginBottom: 60,
        marginRight: 110,
        width: 550,
        height: 300,
        style: { fontSize: "14px" },
        x: { 
          label: "Sample", 
          labelAnchor: "center",
          labelOffset: 45,
          grid: true,
          domain: [0, d3.max(convertedData, d => d.sample)!]
        },
        y: { 
          label: null,
          grid: true,
          domain: [yMin, yMax],
          tickFormat: formatValue
        },
        color: { 
          legend: false,
          scheme: "observable10"
        },
        marks: [
          // Baseline samples (hollow yellow circles)
          Plot.dot(
            convertedData.filter(d => d.isBaseline),
            { 
              x: "sample", 
              y: "displayValue", 
              stroke: "#ffa500",
              fill: "none",
              strokeWidth: 2,
              r: 3,
              opacity: 0.8,
              title: d => `Sample ${d.sample}: ${formatValue(d.displayValue)}${unitSuffix}`
            }
          ),
          // Non-baseline samples (filled blue circles)
          Plot.dot(
            convertedData.filter(d => !d.isBaseline),
            { 
              x: "sample", 
              y: "displayValue", 
              fill: "#4682b4",
              r: 3,
              opacity: 0.8,
              title: d => `Sample ${d.sample}: ${formatValue(d.displayValue)}${unitSuffix}`
            }
          ),
          // Bottom baseline (black line at the bottom of the domain)
          Plot.ruleY([yMin], { stroke: "black", strokeWidth: 1 }),
          // Y-axis label at the top - positioned well above the chart
          Plot.text([{ x: d3.max(convertedData, d => d.sample)! * -0.05, y: yMax * 1.08, text: `Time (${timeUnit})` }], {
            x: "x", 
            y: "y", 
            text: "text", 
            fontSize: 12,
            textAnchor: "middle",
            fill: "#333"
          }),
          
          // Legend background box
          Plot.rect([{
            x1: d3.max(convertedData, d => d.sample)! * 0.65, 
            x2: d3.max(convertedData, d => d.sample)! * 1.05,
            y1: yMax * 0.75,
            y2: yMax * 1.05
          }], {
            x1: "x1", x2: "x2", y1: "y1", y2: "y2",
            fill: "white", fillOpacity: 0.9, stroke: "#ddd", strokeWidth: 1
          }),
          
          // Custom legend - sort so main benchmark is first, baseline second
          ...benchmarks.sort((a, b) => {
            const aBaseline = a.includes("(baseline)");
            const bBaseline = b.includes("(baseline)");
            if (!aBaseline && bBaseline) return -1;
            if (aBaseline && !bBaseline) return 1;
            return 0;
          }).map((benchmark, i) => {
            const isBaseline = benchmark.includes("(baseline)");
            const color = isBaseline ? "#ffa500" : "#4682b4"; // Orange for baseline, blue for main
            const legendY = yMax * 0.95 - i * (yMax * 0.08);
            const legendX = d3.max(convertedData, d => d.sample)! * 0.68;
            
            return isBaseline 
              ? Plot.dot([{x: legendX, y: legendY}], {
                  x: "x", y: "y", stroke: color, fill: "none", strokeWidth: 2, r: 4
                })
              : Plot.dot([{x: legendX, y: legendY}], {
                  x: "x", y: "y", fill: color, r: 4
                });
          }),
          // Custom legend text - closer to symbols
          ...benchmarks.sort((a, b) => {
            const aBaseline = a.includes("(baseline)");
            const bBaseline = b.includes("(baseline)");
            if (!aBaseline && bBaseline) return -1;
            if (aBaseline && !bBaseline) return 1;
            return 0;
          }).map((benchmark, i) => {
            const legendY = yMax * 0.95 - i * (yMax * 0.08);
            const legendX = d3.max(convertedData, d => d.sample)! * 0.72;
            
            return Plot.text([{x: legendX, y: legendY, text: benchmark}], {
              x: "x", y: "y", text: "text", fontSize: 12, textAnchor: "start", fill: "#333"
            });
          })
        ]
      });
      
      this.container.appendChild(plot);
    } catch (error) {
      console.error('Error rendering time series:', error);
      this.container.innerHTML = `<div class="error">Error rendering time series: ${error.message}</div>`;
    }
  }
}