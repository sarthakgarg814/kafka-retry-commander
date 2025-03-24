import { KafkaRetryCommander, RetryMessage } from '../src';

const config = {
  brokers: ['localhost:9092'],
  clientId: 'my-app',
  groupId: 'my-consumer-group',
  topics: ['orders'],
  retryConfig: {
    maxRetries: 3,
    initialDelay: 1000,
    backoffFactor: 2,
    groupId: 'retry-group',
    topics: {
      dlq: 'orders.dlq',
      retry: (retryCount: number) => `orders.retry-${retryCount}`,
    },
  },
};

async function main(): Promise<void> {
  const commander = new KafkaRetryCommander(config);

  commander.setMessageHandler(async (message): Promise<void> => {
    console.warn('Processing message:', message);
    if (!message.orderId) {
      throw new Error('Invalid order message');
    }
  });

  commander.setDLQHandler(async (message: RetryMessage): Promise<void> => {
    console.warn('DLQ message:', {
      originalTopic: message.metadata.originalTopic,
      originalPartition: message.metadata.originalPartition,
      originalOffset: message.metadata.originalOffset,
      error: message.headers?.['x-error-message'],
      retryCount: message.metadata.retryCount,
      lastRetryTimestamp: message.metadata.lastRetryTimestamp,
    });
  });

  await commander.connect();
  await commander.start();
}

void main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
}); 