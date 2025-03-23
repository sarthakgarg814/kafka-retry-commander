import { Kafka, Consumer, Producer, KafkaConfig, ConsumerConfig, ProducerConfig, SASLOptions, RetryOptions } from 'kafkajs';
import { z } from 'zod';
import { Logger } from 'winston';

export interface TopicConfig {
  name: string;
  partitions?: number;
  replicationFactor?: number;
  config?: Record<string, string>;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  backoffFactor: number;
  topics?: {
    dlq?: string;
    retry?: string | ((retryCount: number) => string);
  };
  schema?: {
    type: 'avro' | 'json';
    schema: z.ZodType<any>;
  };
  logging?: {
    level: 'error' | 'warn' | 'info' | 'debug';
    customLogger?: Logger;
  };
  topicConfig?: {
    partitions?: number;
    replicationFactor?: number;
    retention?: {
      retryTopics: number; // in milliseconds
      dlq: number; // in milliseconds
    };
  };
  hooks?: RetryHook[];
  metrics?: RetryMetrics;
}

export interface RetryMetadata {
  retryCount: number;
  lastRetryTimestamp: number;
  nextRetryTimestamp: number;
  originalTopic: string;
  originalPartition: number;
  originalOffset: string;
  error?: string;
  errorStack?: string;
}

export interface KafkaRetryCommanderConfig extends ConsumerConfig {
  clientId: string;
  brokers: string[];
  groupId: string;
  topics: string[];
  retryConfig: RetryConfig;
  errorHandler?: (error: Error, message: any) => Promise<void>;
  ssl?: boolean | { rejectUnauthorized?: boolean };
  sasl?: SASLOptions;
  connectionTimeout?: number;
  authenticationTimeout?: number;
  retry?: RetryOptions;
}

export interface KafkaRetryProducerConfig extends ProducerConfig {
  retryConfig: RetryConfig;
}

export interface RetryMessage {
  key: string;
  value: any;
  headers?: Record<string, string>;
  metadata: RetryMetadata;
}

export interface RetryMetrics {
  incrementRetryCount(topic: string): void;
  incrementDLQCount(topic: string): void;
  recordRetryLatency(topic: string, latency: number): void;
  recordProcessingTime(topic: string, time: number): void;
}

export interface RetryHook {
  beforeRetry?(message: RetryMessage): Promise<void>;
  afterRetry?(message: RetryMessage, success: boolean): Promise<void>;
  beforeDLQ?(message: RetryMessage): Promise<void>;
  afterDLQ?(message: RetryMessage): Promise<void>;
}

export interface RetryContext {
  kafka: Kafka;
  consumer: Consumer;
  producer: Producer;
  logger: Logger;
  metrics?: RetryMetrics;
  hooks?: RetryHook[];
  config: KafkaRetryCommanderConfig;
} 