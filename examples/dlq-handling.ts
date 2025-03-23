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

// DLQ Handler implementation
class DLQHandler implements RetryHook {
  private dlqProcessor: (message: RetryMessage) => Promise<void>;

  constructor(processor: (message: RetryMessage) => Promise<void>) {
    this.dlqProcessor = processor;
  }

  async beforeDLQ(message: RetryMessage): Promise<void> {
    console.log(`Preparing to process DLQ message: ${message.key}`);
    console.log('Message metadata:', message.metadata);
  }

  async afterDLQ(message: RetryMessage): Promise<void> {
    try {
      await this.dlqProcessor(message);
      console.log(`Successfully processed DLQ message: ${message.key}`);
    } catch (error) {
      console.error(`Failed to process DLQ message: ${message.key}`, error);
      throw error;
    }
  }
}

// Example DLQ processor
async function processDLQMessage(message: RetryMessage): Promise<void> {
  // Here you can implement your DLQ processing logic
  // For example:
  // 1. Send to error monitoring service
  // 2. Store in a database for manual review
  // 3. Send notifications to the team
  // 4. Archive the message
  console.log('Processing DLQ message:', {
    key: message.key,
    value: message.value,
    metadata: message.metadata
  });

  // Simulate some processing
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function main() {
  // Create KafkaRetryConsumer instance with DLQ handling
  const consumer = new KafkaRetryCommander({
    clientId: 'dlq-example-consumer',
    brokers: ['localhost:9092'],
    groupId: 'dlq-example-group',
    topics: ['orders'],
    retryConfig: {
      maxRetries: 3,
      initialDelay: 1000, // 1 second
      backoffFactor: 2,
      topics: {
        dlq: 'failed-orders',
        retry: (retryCount) => `retry-orders-${retryCount}`
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
      hooks: [new DLQHandler(processDLQMessage)]
    },
    errorHandler: async (error, message) => {
      console.error('Error processing message:', error);
      console.error('Message:', message);
    }
  });

  try {
    // Connect to Kafka
    await consumer.connect();

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