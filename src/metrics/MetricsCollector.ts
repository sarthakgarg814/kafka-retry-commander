import { RetryMetrics } from '../types';

export interface MetricsCollectorConfig {
  enabled: boolean;
  prefix?: string;
  labels?: Record<string, string>;
}

export class MetricsCollector implements RetryMetrics {
  private enabled: boolean;
  private prefix: string;
  private labels: Record<string, string>;
  private metrics: Map<string, number>;

  constructor(config: MetricsCollectorConfig) {
    this.enabled = config.enabled;
    this.prefix = config.prefix || 'kafka_retry';
    this.labels = config.labels || {};
    this.metrics = new Map();
  }

  private getMetricName(name: string): string {
    return `${this.prefix}_${name}`;
  }

  private getMetricKey(name: string, topic: string): string {
    return `${this.getMetricName(name)}_${topic}`;
  }

  incrementRetryCount(topic: string): void {
    if (!this.enabled) return;

    const key = this.getMetricKey('retry_count', topic);
    const currentValue = this.metrics.get(key) || 0;
    this.metrics.set(key, currentValue + 1);
  }

  incrementDLQCount(topic: string): void {
    if (!this.enabled) return;

    const key = this.getMetricKey('dlq_count', topic);
    const currentValue = this.metrics.get(key) || 0;
    this.metrics.set(key, currentValue + 1);
  }

  recordRetryLatency(topic: string, latency: number): void {
    if (!this.enabled) return;

    const key = this.getMetricKey('retry_latency', topic);
    const currentValue = this.metrics.get(key) || 0;
    this.metrics.set(key, (currentValue + latency) / 2); // Simple moving average
  }

  recordProcessingTime(topic: string, time: number): void {
    if (!this.enabled) return;

    const key = this.getMetricKey('processing_time', topic);
    const currentValue = this.metrics.get(key) || 0;
    this.metrics.set(key, (currentValue + time) / 2); // Simple moving average
  }

  getMetrics(): Record<string, number> {
    const result: Record<string, number> = {};
    this.metrics.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  reset(): void {
    this.metrics.clear();
  }
} 