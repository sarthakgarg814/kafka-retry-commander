import { KafkaRetryConsumer } from '../src/KafkaRetryConsumer';
import { z } from 'zod';

// Define a complex message schema with nested objects and arrays
const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(100),
  email: z.string().email(),
  age: z.number().int().min(0).max(150).optional(),
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'system']),
    notifications: z.boolean(),
    language: z.string().length(2)
  }).optional(),
  tags: z.array(z.string()).max(10).optional()
});

const orderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
    price: z.number().positive()
  })),
  total: z.number().positive(),
  status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
  createdAt: z.number(),
  updatedAt: z.number()
});

// Union type for different message types
const messageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user'),
    data: userSchema
  }),
  z.object({
    type: z.literal('order'),
    data: orderSchema
  })
]);

async function main() {
  // Create a consumer instance with schema validation
  const consumer = new KafkaRetryConsumer({
    clientId: 'schema-validation-consumer',
    brokers: ['localhost:9092'],
    groupId: 'schema-validation-group',
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
        replicationFactor: 1,
        retention: {
          retryTopics: 24 * 60 * 60 * 1000, // 24 hours
          dlq: 7 * 24 * 60 * 60 * 1000 // 7 days
        }
      }
    }
  });

  // Set up message processing function
  consumer.setMessageHandler(async (message) => {
    try {
      // Process the message
      await processMessage(message);
    } catch (error) {
      console.error('Error processing message:', error);
      throw error; // This will trigger the retry mechanism
    }
  });

  // Set up DLQ handler
  consumer.setDLQHandler(async (message) => {
    console.log('Processing DLQ message:', message);
    // Handle failed messages (e.g., store in database, send notifications)
  });

  // Connect to Kafka
  await consumer.connect();

  // Start processing messages
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
}

async function processMessage(message: any) {
  // Implement your message processing logic here
  console.log('Processing message:', message);
  
  // Example: Process the message data based on type
  if (message.type === 'user') {
    // Handle user message
    const { id, name, email, age, preferences, tags } = message.data;
    console.log('Processing user:', { id, name, email, age, preferences, tags });
  } else if (message.type === 'order') {
    // Handle order message
    const { id, userId, items, total, status, createdAt, updatedAt } = message.data;
    console.log('Processing order:', { id, userId, items, total, status, createdAt, updatedAt });
  }
  
  // If processing fails, throw an error to trigger retry
  if (Math.random() < 0.3) { // Example: 30% chance of failure
    throw new Error('Random processing error');
  }
  
  console.log('Message processed successfully');
}

// Run the example
main().catch(console.error); 