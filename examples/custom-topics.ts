import { KafkaRetryCommander } from '../src';
import { z } from 'zod';

// Define message schema
const messageSchema = z.object({
  id: z.string(),
  data: z.any(),
  timestamp: z.number()
});

async function main() {
  // Create consumer instance with custom topic naming
  const consumer = new KafkaRetryCommander({
    clientId: 'custom-topics-example-consumer',
    brokers: ['localhost:9092'],
    groupId: 'custom-topics-example-group',
    topics: ['example-topic'],
    retryConfig: {
      maxRetries: 3,
      initialDelay: 1000,
      backoffFactor: 2,
      schema: {
        type: 'json',
        schema: messageSchema
      },
      topics: {
        // Custom DLQ topic name
        dlq: 'custom-dlq-topic',
        // Custom retry topic naming function
        retry: (retryCount) => `custom-retry-topic-${retryCount}`
      },
      topicConfig: {
        partitions: 3,
        replicationFactor: 2,
        retention: {
          retryTopics: 24 * 60 * 60 * 1000, // 24 hours
          dlq: 7 * 24 * 60 * 60 * 1000 // 7 days
        }
      }
    }
  });

  // Set up message processing
  consumer.setMessageHandler(async (message) => {
    console.log('Processing message:', message);
    await processMessage(message);
  });

  // Set up DLQ handling
  consumer.setDLQHandler(async (message) => {
    console.log('Processing DLQ message:', message);
    await handleDLQMessage(message);
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

// Example message processing function
async function processMessage(message: any): Promise<void> {
  // Add your message processing logic here
  console.log('Message processed successfully:', message);
}

// Example DLQ message handling function
async function handleDLQMessage(message: any): Promise<void> {
  // Add your DLQ handling logic here
  console.log('DLQ message handled:', message);
}

// Run the example
main().catch(console.error); 