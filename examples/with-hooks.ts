import { KafkaRetryCommander, RetryMessage } from '../src';

const config = {
  brokers: ['localhost:9092'],
  clientId: 'hooks-app',
  groupId: 'hooks-group',
  topics: ['orders'],
  retryConfig: {
    maxRetries: 3,
    initialDelay: 1000,
    backoffFactor: 2,
    groupId: 'retry-hooks-group',
    topics: {
      dlq: 'orders.dlq',
      retry: (retryCount: number) => `orders.retry-${retryCount}`,
    },
  },
};

async function main(): Promise<void> {
  const commander = new KafkaRetryCommander(config);

  commander.addHook({
    beforeRetry: async (message: RetryMessage): Promise<void> => {
      console.warn('Before retry:', {
        originalTopic: message.metadata.originalTopic,
        originalPartition: message.metadata.originalPartition,
        retryCount: message.metadata.retryCount,
        lastRetryTimestamp: message.metadata.lastRetryTimestamp,
        nextRetryTimestamp: message.metadata.nextRetryTimestamp,
      });
    },
    afterRetry: async (message: RetryMessage): Promise<void> => {
      console.warn('After retry:', {
        originalTopic: message.metadata.originalTopic,
        originalPartition: message.metadata.originalPartition,
        retryCount: message.metadata.retryCount,
        lastRetryTimestamp: message.metadata.lastRetryTimestamp,
        nextRetryTimestamp: message.metadata.nextRetryTimestamp,
      });
    },
  });

  commander.setMessageHandler(async (message): Promise<void> => {
    console.warn('Processing message:', message);
  });

  await commander.connect();
  await commander.start();
}

void main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
}); 