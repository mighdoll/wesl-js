# Bench-Viz: Benchmark Visualization Tool

## Overview

Bench-viz is a benchmark visualization tool built with Observable Plot and Svelte. It provides interactive charts for analyzing performance benchmark data, including time series trends, distribution histograms, and Q-Q plots for normality testing.

### Chart Types
- **Time Series**: Shows performance over multiple samples with dots and lines
- **Histogram**: Displays distribution of execution times as overlapping frequency bars
- **Q-Q Plot**: Quantile-quantile plots for assessing normality of distributions (main benchmark only, not baseline)

## Architecture

### Core Components
- **Data Loading**: Reads benchmark JSON data from `/public/data/benchmark-results.json`
- **Chart Types**:
  - **Time Series**: Shows performance over multiple samples with dots and lines
  - **Histogram**: Displays distribution of execution times as frequency bars
- **Color System**: Shared color utilities with gray for baselines, Tableau10 colors for benchmarks

### Key Files
```
src/
├── chart-logic/
│   ├── Histogram.ts       # Histogram chart implementation
│   ├── TimeSeries.ts      # Time series chart implementation
│   ├── ColorUtils.ts      # Shared color mapping utilities
│   ├── DataUtils.ts       # Data transformation utilities
│   ├── QqPlot.ts          # Q-Q plot for normality testing
│   ├── ChartVerifier.ts   # Chart verification & debugging utilities
│   └── Utils.ts           # Common chart configuration
├── components/
│   ├── LoadBenchmarkData.svelte.ts  # Data loading logic
│   ├── BenchmarkGroup.svelte        # Main benchmark display
│   └── QQPlot.svelte               # Q-Q plot component
├── stats/
│   └── StatisticalUtils.ts # Statistical calculations
```

Note: TypeScript files follow capital letter naming convention per project standards.

## Chart Verification (verifyChart)

### Purpose
The `verifyChart()` function provides programmatic verification of chart rendering, allowing automated testing and debugging without relying on visual inspection. This is especially useful for CI/CD pipelines and agent-based development.

### Usage

```typescript
import { verifyChart } from './chart-logic/chartVerifier';

// After chart renders
const container = document.querySelector('.chart-container');
const verification = verifyChart(container);

// Verification returns structured data
console.log({
  markType: verification.markType,        // 'rect' | 'circle' | 'path'
  count: verification.count,               // Number of marks found
  colors: verification.colors,             // Array of fill colors used
  positions: verification.positions        // Array of {x, y} coordinates
});

// Example assertions
if (verification.count === 0) {
  console.error('No chart marks found - chart may not be rendering');
}

if (!verification.colors.includes('#c0c0c0')) {
  console.warn('Baseline gray color not found');
}
```

### Chart-Specific Verification

#### Histogram Verification
```typescript
// Histograms should have rect elements (bars)
const histogramVerification = verifyChart(histogramContainer);
assert(histogramVerification.markType === 'rect', 'Histogram should use rectangles');
assert(histogramVerification.count > 0, 'Histogram should have visible bars');
```

#### Time Series Verification
```typescript
// Time series should have circle elements (dots)
const timeSeriesVerification = verifyChart(timeSeriesContainer);
assert(timeSeriesVerification.markType === 'circle', 'Time series should use circles');
assert(timeSeriesVerification.count === expectedSampleCount, 'All data points should be visible');
```

### Playwright Integration

For automated testing with Playwright:

```javascript
// In test files
const chartData = await page.evaluate(() => {
  const container = document.querySelector('.chart-container');
  // Get all rect elements that aren't backgrounds
  const rects = Array.from(container.querySelectorAll('rect'))
    .filter(r => r.getAttribute('width') !== '100%');

  return {
    barCount: rects.length,
    colors: rects.map(r => r.getAttribute('fill')),
    heights: rects.map(r => parseFloat(r.getAttribute('height')))
  };
});

console.log(`Found ${chartData.barCount} bars`);
console.log(`Colors: ${chartData.colors.join(', ')}`);
```

### Debugging Tips

1. **Check mark count**: Zero marks usually means data isn't being processed
2. **Verify colors**: Should see gray (#c0c0c0) for baselines, blue for regular benchmarks
3. **Check positions**: Marks at x=0 or y=0 might indicate scaling issues
4. **Validate attributes**: Missing width/height on rects suggests binning problems

## Common Issues & Solutions

### Issue: Histogram bars not visible
**Symptoms**: Legend shows but no bars appear
**Solution**: Check Plot.binX syntax - use `Plot.binX({y: "count"}, {x: "value"})` not spread operator

### Issue: Wrong colors appearing
**Symptoms**: All marks same color or no gray baseline
**Solution**: Ensure `fill: "name"` is set and data includes name field with "(baseline)" suffix for baselines

### Issue: TypeScript errors with Plot options
**Symptoms**: "Property does not exist" errors
**Solution**: Place style properties (fill, fillOpacity) outside of Plot.binX transform

## Development Workflow

```bash
# Start development server
pnpm dev

# Type check
bb typecheck:all
bb prepush  # Full validation before commits
```

## Debugging & Verification

### Browser Console Debugging
When the dev server is running with `debugCharts = true` (default in ChartVerifier.ts), these functions are available in the browser console:

```javascript
// Verify any chart - provides detailed analysis
window.verifyChart(svg)  // Pass SVG element directly

// Log detailed chart verification info
window.logChartVerification(svg)  // Logs mark types, counts, colors, positions

// Debug SVG structure - shows element hierarchy
window.debugSVGStructure(container)  // Shows all SVG children and attributes

// Verify histogram coverage specifically
window.verifyHistogramCoverage(svg)  // Checks if bars adequately cover data range
```

Note: Debug functions are automatically exposed when `debugCharts = true`. Set to `false` in production.

### Playwright Verification
```javascript
// Check if histogram bars are rendering
const result = await page.evaluate(() => {
  const rects = document.querySelectorAll('svg rect:not([width="100%"])');
  const visibleRects = Array.from(rects).filter(r => {
    const width = parseFloat(r.getAttribute('width') || '0');
    const height = parseFloat(r.getAttribute('height') || '0');
    return width > 0 && height > 0;
  });

  return {
    total: rects.length,
    visible: visibleRects.length,
    colors: [...new Set(Array.from(rects).map(r => r.getAttribute('fill')))]
  };
});

console.log(`Found ${result.visible} visible bars with colors: ${result.colors}`);
```

### Common Verification Checks
1. **No bars visible**: Check console for "Created overlapping histogram" message with totalBars > 0
2. **Verify colors**: Should see #c0c0c0 (baseline gray) and #4e79a7 (benchmark blue)
3. **Check SVG structure**: Look for a `<g>` element with 22+ child `<rect>` elements
4. **Verify data loading**: Console should show "Data points created: 192" or similar

## Observable Plot Patterns

### Histogram with Overlapping Series (Recommended Approach)

**Best Practice**: Create separate marks for each series to achieve proper overlapping without stacking:

```typescript
// Calculate shared bin configuration for consistency
const binConfig = calcBinConfig(allData.map(d => d.value));

// Create separate mark for each series - ensures proper overlapping
const marks = uniqueNames.map(name => {
  const seriesData = allData.filter(d => d.name === name);
  const color = colorScale(name);

  return Plot.rectY(seriesData, {
    ...Plot.binX(
      { y: "count" },
      { x: "value", thresholds: binConfig.bins }
    ),
    fill: color,
    fillOpacity: 0.6,
    tip: true
  });
});

// Add to plot
Plot.plot({
  marks: [...marks],
  // other config...
})
```

**Key Learnings from Plot.binX**:
- Using `z` channel creates dodged (side-by-side) bars, not overlapping
- Using `y` channel with multiple series causes stacking
- Using `y2` channel theoretically avoids stacking but has inconsistent behavior
- **Solution**: Create separate marks for each series with same bin thresholds

**Alternative Manual Approach** (when you need full control):
```typescript
// Manual binning for complex scenarios
const binner = d3.bin()
  .domain([min * 0.99, max * 1.01])  // Extend slightly for edge cases
  .thresholds(bins);

// Transform to rect data manually
const rectData = [];
uniqueNames.forEach(name => {
  const values = data.filter(d => d.name === name).map(d => d.value);
  const bins = binner(values);
  bins.forEach(bin => {
    if (bin.length > 0) {
      rectData.push({
        x1: bin.x0,
        x2: bin.x1,
        y: bin.length,
        name: name
      });
    }
  });
});

Plot.rect(rectData, {
  x1: "x1", x2: "x2",
  y1: 0, y2: "y",
  fill: "name",
  fillOpacity: 0.6
})
```

### Time Series with Dot Marks
```typescript
Plot.dot(data, {
  x: "sample",
  y: "value",
  fill: "name",
  stroke: "name"
})
```

### Color Scale Configuration
```typescript
color: {
  legend: true,
  range: createColorRange(names),  // Custom color array with gray for baseline
  domain: names                     // Category names
}
```

**Color Utility Functions** (from ColorUtils.ts):
```typescript
// Extract unique benchmark names from data
const names = extractNames(allData);

// Create color range with gray for baseline, Tableau10 for others
const colors = createColorRange(names);
```


## Histogram Chart Debugging Guide

When debugging histogram chart issues in `tools/packages/bench-viz/src/chart-logic/histogram.ts`:

### Common Issues & Checks

1. **Missing rightmost bar (outliers not visible)**
   - Check: Browser DevTools → inspect SVG → look for rect with x near right edge
   - Problem: Last bin width might be 0 if bin edge equals data max
   - Solution: Extend range slightly beyond max (1% extension) in `calcBinConfig()`
   - Verify: `console.assert(bins[bins.length - 1] > max, "Last bin should extend beyond max")`

2. **Bars with zero width**
   - Check: `document.querySelectorAll('rect[width="0"]')` in browser console
   - Problem: Bin boundaries exactly match axis domain edges
   - Solution: Ensure bins extend slightly beyond data range

3. **Bars with negative y values**
   - Check: Look for bars extending above chart top
   - Problem: Plot.binX with stacking when using `y` channel
   - Solution: Use separate marks for each series or use `y2` channel to avoid stacking

4. **Bars not overlapping (side-by-side instead)**
   - Problem: Plot.binX with `z` channel creates dodged bars by default
   - Solution: Create separate `Plot.rectY` marks for each series with same thresholds

5. **Insufficient bar coverage**
   - Check: Use `chartVerifier.ts` histogram coverage detection
   - Verify: Total bar width should cover ~80% of x-axis range
   - Solution: Adjust bin count or check for missing data

### Implementation Approach

**Current working solution**: Use Plot.binX with separate marks for overlapping histograms:
```typescript
const marks = uniqueNames.map(name => {
  const seriesData = allData.filter(d => d.name === name);
  return Plot.rectY(seriesData, {
    ...Plot.binX(
      { y: "count" },
      { x: "value", thresholds: binConfig.bins }
    ),
    fill: color,
    fillOpacity: 0.6,
  });
});
```

### Debug Logging
Enable debug logging to verify:
- Data range vs bin range
- Outlier detection (values > 80ms, > 90ms)
- Bin count and coverage
- Number of bars created per series

## Recent Improvements (2025)

### Code Quality Refactoring
- **File Naming**: All TypeScript files now use capital letters (e.g., `Histogram.ts`, `ColorUtils.ts`)
- **Function Size**: All functions refactored to <25 lines (40 max) for better maintainability
- **Code Organization**: Exports at top, utilities at bottom per project conventions
- **Console Logging**: Removed all console statements except `debugCharts` flag for debugging

### API Improvements
- **Renamed Functions**:
  - `createBenchmarkColorRange()` → `createColorRange()` (concise naming)
  - `getBenchmarkNames()` → `extractNames()` (clearer verb)
- **Better Documentation**: Added JSDoc comments for public APIs, removed redundant comments

### Chart Enhancements
- **Q-Q Plots**: Now only show main benchmark (baseline excluded) for cleaner visualization
- **Histogram Debugging**: Added `verifyHistogramCoverage()` for automated testing
- **Chart Verification**: Exposed debugging functions globally when `debugCharts = true`
