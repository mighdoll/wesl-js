import type { BenchmarkData } from "./JsonData.ts";

/** Manages benchmark data fetching and update notifications */
export class BenchmarkDataSource {
  private data: BenchmarkData | null = null;
  private listeners: Set<(data: BenchmarkData | null) => void> = new Set();
  private pollInterval?: number;
  private dataPath: string;

  constructor(dataPath = "./data/benchmark-results.json") {
    this.dataPath = dataPath;
  }

  startPolling(intervalMs = 1000): void {
    this.stopPolling();
    this.loadData();

    this.pollInterval = window.setInterval(() => {
      this.loadData();
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  async loadData(): Promise<void> {
    try {
      const response = await fetch(this.dataPath);
      if (response.ok) {
        const newData = (await response.json()) as BenchmarkData;
        if (JSON.stringify(newData) !== JSON.stringify(this.data)) {
          this.data = newData;
          this.notifyListeners();
        }
      } else {
        console.log("No benchmark data available yet");
        if (this.data !== null) {
          this.data = null;
          this.notifyListeners();
        }
      }
    } catch (error) {
      console.log(
        "Waiting for benchmark data...",
        error instanceof Error ? error.message : String(error),
      );
      if (this.data !== null) {
        this.data = null;
        this.notifyListeners();
      }
    }
  }

  /** @return unsubscribe function */
  subscribe(listener: (data: BenchmarkData | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.data); // notify immediately with current state
    return () => {
      this.listeners.delete(listener);
    };
  }

  getData(): BenchmarkData | null {
    return this.data;
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.data));
  }

  destroy(): void {
    this.stopPolling();
    this.listeners.clear();
  }
}
