import { KafkaRetryCommander, RetryHook, RetryMetrics, RetryMessage } from '../src';
import { z } from 'zod';

// Define message schema
const messageSchema = z.object({
  id: z.string(),
  data: z.any(),
  timestamp: z.number()
});

// Custom metrics implementation
class CustomMetrics implements RetryMetrics {
  private retryCounts: Map<string, number> = new Map();
  private dlqCounts: Map<string, number> = new Map();
  private processingTimes: Map<string, number[]> = new Map();

  incrementRetryCount(topic: string): void {
    const current = this.retryCounts.get(topic) || 0;
    this.retryCounts.set(topic, current + 1);
    console.log(`Retry count for ${topic}: ${current + 1}`);
  }

  incrementDLQCount(topic: string): void {
    const current = this.dlqCounts.get(topic) || 0;
    this.dlqCounts.set(topic, current + 1);
    console.log(`DLQ count for ${topic}: ${current + 1}`);
  }

  recordRetryLatency(topic: string, latency: number): void {
    console.log(`Retry latency for ${topic}: ${latency}ms`);
  }

  recordProcessingTime(topic: string, time: number): void {
    const times = this.processingTimes.get(topic) || [];
    times.push(time);
    this.processingTimes.set(topic, times);
    console.log(`Processing time for ${topic}: ${time}ms`);
  }
}

// Custom hook implementation
const customHook: RetryHook = {
  async beforeRetry(message: RetryMessage): Promise<void> {
    console.log('Before retry:', {
      topic: message.metadata.originalTopic,
      retryCount: message.metadata.retryCount,
      key: message.key
    });
  },

  async afterRetry(message: RetryMessage, success: boolean): Promise<void> {
    console.log('After retry:', {
      topic: message.metadata.originalTopic,
      retryCount: message.metadata.retryCount,
      success,
      key: message.key
    });
  },

  async beforeDLQ(message: RetryMessage): Promise<void> {
    console.log('Before DLQ:', {
      topic: message.metadata.originalTopic,
      retryCount: message.metadata.retryCount,
      error: message.metadata.error,
      key: message.key
    });
  },

  async afterDLQ(message: RetryMessage): Promise<void> {
    console.log('After DLQ:', {
      topic: message.metadata.originalTopic,
      retryCount: message.metadata.retryCount,
      key: message.key
    });
  }
};

async function main() {
  // Create consumer instance with advanced configuration
  const consumer = new KafkaRetryCommander({
    clientId: 'advanced-example-consumer',
    brokers: ['localhost:9092'],
    groupId: 'advanced-example-group',
    topics: ['example-topic'],
    retryConfig: {
      maxRetries: 3,
      initialDelay: 1000,
      backoffFactor: 2,
      schema: {
        type: 'json',
        schema: messageSchema
      },
      topicConfig: {
        partitions: 3,
        replicationFactor: 2,
        retention: {
          retryTopics: 24 * 60 * 60 * 1000, // 24 hours
          dlq: 7 * 24 * 60 * 60 * 1000 // 7 days
        }
      },
      logging: {
        level: 'debug'
      }
    }
  });

  // Set up custom metrics
  const metrics = new CustomMetrics();
  consumer.setMetrics(metrics);

  // Add custom hook
  consumer.addHook(customHook);

  // Set up message processing with error handling
  consumer.setMessageHandler(async (message) => {
    try {
      console.log('Processing message:', message);
      await processMessage(message);
    } catch (error) {
      console.error('Error processing message:', error);
      throw error; // This will trigger the retry mechanism
    }
  });

  // Set up DLQ handling with error tracking
  consumer.setDLQHandler(async (message) => {
    try {
      console.log('Processing DLQ message:', message);
      await handleDLQMessage(message);
    } catch (error) {
      console.error('Error handling DLQ message:', error);
      // You might want to store failed DLQ processing attempts
      throw error;
    }
  });

  try {
    // Connect to Kafka
    await consumer.connect();
    console.log('Connected to Kafka');

    // Start processing messages
    await consumer.start();
    console.log('Started processing messages');

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM signal');
      await consumer.shutdown();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('Received SIGINT signal');
      await consumer.shutdown();
      process.exit(0);
    });
  } catch (error) {
    console.error('Error:', error);
    await consumer.shutdown();
    process.exit(1);
  }
}

// Example message processing function with simulated failures
async function processMessage(message: any): Promise<void> {
  // Simulate random processing failures (30% chance)
  if (Math.random() < 0.3) {
    throw new Error('Random processing error');
  }

  // Add your message processing logic here
  console.log('Message processed successfully:', message);
}

// Example DLQ message handling function
async function handleDLQMessage(message: any): Promise<void> {
  // Add your DLQ handling logic here
  // For example:
  // - Store failed messages in a database
  // - Send notifications
  // - Generate alerts
  console.log('DLQ message handled:', message);
}

// Run the example
main().catch(console.error); 