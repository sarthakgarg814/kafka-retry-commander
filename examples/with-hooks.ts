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
    topics: ['orders']
  }
};

async function main() {
  const commander = new KafkaRetryCommander(config);

  // Add processing hooks
  commander.addHook({
    beforeRetry: async (message) => {
      console.log('Before retry:', {
        originalTopic: message.metadata.originalTopic,
        originalPartition: message.metadata.originalPartition,
        retryCount: message.metadata.retryCount,
        lastRetryTimestamp: message.metadata.lastRetryTimestamp,
        nextRetryTimestamp: message.metadata.nextRetryTimestamp
      });
    },
    afterRetry: async (message: RetryMessage) => {
      console.log('After retry:', {
        originalTopic: message.metadata.originalTopic,
        originalPartition: message.metadata.originalPartition,
        retryCount: message.metadata.retryCount,
        lastRetryTimestamp: message.metadata.lastRetryTimestamp,
        nextRetryTimestamp: message.metadata.nextRetryTimestamp
      });
    }
  });

  commander.setMessageHandler(async (message) => {
    console.log('Processing message:', message);
  });

  await commander.connect();
  await commander.start();
}

main().catch(console.error); 