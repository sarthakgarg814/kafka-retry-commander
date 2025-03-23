import { KafkaRetryCommander, RetryHook, RetryMessage } from '../src';
import { z } from 'zod';
import { createLogger, format, transports } from 'winston';

// Define message schema using Zod
const messageSchema = z.object({
  id: z.string(),
  type: z.enum(['order', 'payment', 'notification']),
  data: z.record(z.unknown()),
  timestamp: z.number()
});

// Custom logger implementation
const customLogger = createLogger({
  level: 'debug',
  format: format.combine(
    format.timestamp(),
    format.colorize(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
    })
  ),
  transports: [
    new transports.Console()
  ]
});

// Custom hook implementation
class RetryLoggerHook implements RetryHook {
  async beforeRetry(message: RetryMessage): Promise<void> {
    console.log(`Preparing to retry message: ${message.key}`);
  }

  async afterRetry(message: RetryMessage, success: boolean): Promise<void> {
    console.log(`Retry attempt ${message.metadata.retryCount} ${success ? 'succeeded' : 'failed'}`);
  }

  async beforeDLQ(message: RetryMessage): Promise<void> {
    console.log(`Moving message to DLQ: ${message.key}`);
  }

  async afterDLQ(message: RetryMessage): Promise<void> {
    console.log(`Message moved to DLQ: ${message.key}`);
  }
}

// Custom metrics implementation
const customMetrics = {
  retryCounts: new Map<string, number>(),
  dlqCounts: new Map<string, number>(),
  latencies: new Map<string, number[]>(),
  processingTimes: new Map<string, number[]>(),

  incrementRetryCount(topic: string): void {
    const count = this.retryCounts.get(topic) || 0;
    this.retryCounts.set(topic, count + 1);
  },

  incrementDLQCount(topic: string): void {
    const count = this.dlqCounts.get(topic) || 0;
    this.dlqCounts.set(topic, count + 1);
  },

  recordRetryLatency(topic: string, latency: number): void {
    const latencies = this.latencies.get(topic) || [];
    latencies.push(latency);
    this.latencies.set(topic, latencies);
  },

  recordProcessingTime(topic: string, time: number): void {
    const times = this.processingTimes.get(topic) || [];
    times.push(time);
    this.processingTimes.set(topic, times);
  }
};

async function main() {
  // Create KafkaRetryConsumer instance with comprehensive configuration
  const consumer = new KafkaRetryCommander({
    clientId: 'example-consumer',
    brokers: ['localhost:9092'],
    groupId: 'example-group',
    topics: ['orders', 'payments', 'notifications'],
    retryConfig: {
      maxRetries: 3,
      initialDelay: 1000, // 1 second
      backoffFactor: 2,
      topics: {
        dlq: 'failed-messages',
        retry: (retryCount) => `retry-${retryCount}`
      },
      schema: {
        type: 'json',
        schema: messageSchema
      },
      logging: {
        level: 'debug',
        customLogger
      },
      topicConfig: {
        partitions: 3,
        replicationFactor: 1,
        retention: {
          retryTopics: 7 * 24 * 60 * 60 * 1000, // 7 days
          dlq: 30 * 24 * 60 * 60 * 1000 // 30 days
        }
      },
      hooks: [new RetryLoggerHook()],
      metrics: customMetrics
    },
    errorHandler: async (error, message) => {
      console.error('Error processing message:', error);
      console.error('Message:', message);
    }
  });

  try {
    // Connect to Kafka
    await consumer.connect();

    // Add additional hook after initialization
    consumer.addHook({
      beforeRetry: async (message) => {
        console.log(`Additional hook: Preparing to retry message: ${message.key}`);
      }
    });

    // Start consuming messages
    await consumer.start();

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM. Shutting down...');
      await consumer.shutdown();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('Received SIGINT. Shutting down...');
      await consumer.shutdown();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start consumer:', error);
    await consumer.shutdown();
    process.exit(1);
  }
}

// Run the example
main().catch(console.error); 