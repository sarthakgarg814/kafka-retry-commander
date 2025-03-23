import { KafkaRetryCommander } from '../src';
import { EachBatchPayload } from 'kafkajs';
import { z } from 'zod';

// Define message schema
const messageSchema = z.object({
  id: z.string(),
  data: z.any(),
  timestamp: z.number()
});

async function main() {
  // Create consumer instance with batch processing configuration
  const consumer = new KafkaRetryCommander({
    clientId: 'batch-example-consumer',
    brokers: ['localhost:9092'],
    groupId: 'batch-example-group',
    topics: ['example-topic'],
    retryConfig: {
      maxRetries: 3,
      initialDelay: 1000,
      backoffFactor: 2,
      schema: {
        type: 'json',
        schema: messageSchema
      }
    }
  });

  // Set up batch message processing
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

    // Start processing messages in batches
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