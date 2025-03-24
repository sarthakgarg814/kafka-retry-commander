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
    topics: ['orders']
  }
};

async function main() {
  const commander = new KafkaRetryCommander(config);

  // Handle regular messages
  commander.setMessageHandler(async (message) => {
    console.log('Processing message:', message);
    if (!message.orderId) {
      throw new Error('Invalid order message');
    }
  });

  // Handle DLQ messages
  commander.setDLQHandler(async (message:) => {
    console.log('DLQ message:', {
      originalTopic: message.metadata.originalTopic,
      originalPartition: message.metadata.originalPartition,
      originalOffset: message.metadata.originalOffset,
      error: message.headers?.['x-error-message'],
      retryCount: message.metadata.retryCount,
      lastRetryTimestamp: message.metadata.lastRetryTimestamp
    });
  });

  await commander.connect();
  await commander.start();
}

main().catch(console.error); 