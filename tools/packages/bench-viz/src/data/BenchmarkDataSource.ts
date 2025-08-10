import type { BenchmarkData } from '../types.ts';

export class BenchmarkDataSource {
  private data: BenchmarkData | null = null;
  private listeners: Set<(data: BenchmarkData | null) => void> = new Set();
  private pollInterval?: number;
  
  constructor(private dataPath = './data/benchmark-results.json') {}
  
  /** Start polling for data updates */
  startPolling(intervalMs = 1000): void {
    this.stopPolling();
    this.loadData(); // Initial load
    
    this.pollInterval = window.setInterval(() => {
      this.loadData();
    }, intervalMs);
  }
  
  /** Stop polling for updates */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }
  
  /** Manually load data once */
  async loadData(): Promise<void> {
    try {
      const response = await fetch(this.dataPath);
      if (response.ok) {
        const newData = await response.json() as BenchmarkData;
        if (JSON.stringify(newData) !== JSON.stringify(this.data)) {
          this.data = newData;
          this.notifyListeners();
        }
      } else {
        console.log('No benchmark data available yet');
        if (this.data !== null) {
          this.data = null;
          this.notifyListeners();
        }
      }
    } catch (error) {
      console.log('Waiting for benchmark data...', error.message);
      if (this.data !== null) {
        this.data = null;
        this.notifyListeners();
      }
    }
  }
  
  /** Subscribe to data changes */
  subscribe(listener: (data: BenchmarkData | null) => void): () => void {
    this.listeners.add(listener);
    
    // Immediately notify with current data
    listener(this.data);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }
  
  /** Get current data */
  getData(): BenchmarkData | null {
    return this.data;
  }
  
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.data));
  }
  
  /** Clean up resources */
  destroy(): void {
    this.stopPolling();
    this.listeners.clear();
  }
}