import { KafkaRetryCommander, KafkaRetryCommanderConfig } from '../src';
import { z } from 'zod';

// Define message schema
const OrderSchema = z.object({
  orderId: z.string(),
  amount: z.number().positive(),
  userId: z.string()
});

const config = {
  brokers: ['localhost:9092'],
  clientId: 'validation-app',
  groupId: 'validation-group',
  topics: ['orders'],
  retryConfig: {
    maxRetries: 3,
    initialDelay: 1000,
    backoffFactor: 2,
    groupId: 'retry-validation-group',
    topics: ['orders'],
    schema: {
      type: 'json',
      schema: OrderSchema
    }
  }
};

async function main() {
  const commander = new KafkaRetryCommander(config as KafkaRetryCommanderConfig);

  commander.setMessageHandler(async (message) => {
    // Message is already validated against OrderSchema
    console.log('Processing validated order:', message);
  });

  await commander.connect();
  await commander.start();
}

main().catch(console.error); 