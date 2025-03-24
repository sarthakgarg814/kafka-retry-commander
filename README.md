# Kafka Retry Commander

A robust Kafka consumer with built-in retry mechanism, dead letter queues, and message validation.

## Features

- ♻️ Automatic retry handling with exponential backoff
- 🔍 Schema validation using Zod
- 📬 Dead Letter Queue (DLQ) support
- 🪝 Processing lifecycle hooks
- 📊 Built-in metrics
- 🛑 Graceful shutdown handling

## Installation

```bash
npm install kafka-retry-commander
```

## Quick Start

```typescript
import { KafkaRetryCommander } from 'kafka-retry-commander';

const config = {
  brokers: ['localhost:9092'],
  clientId: 'my-app',
  groupId: 'my-consumer-group',
  topics: ['orders'],
  retryConfig: {
    maxRetries: 3,
    initialDelay: 1000,
    backoffFactor: 2,
    groupId: 'retry-group'
  }
};

const commander = new KafkaRetryCommander(config);

// Set message handler
commander.setMessageHandler(async (message) => {
  console.log('Processing:', message);
});

await commander.connect();
await commander.start();
```

## Examples

### Message Validation

Using Zod for message validation:

```typescript
import { z } from 'zod';

const OrderSchema = z.object({
  orderId: z.string(),
  amount: z.number().positive(),
  userId: z.string()
});

const config = {
  // ... other config
  retryConfig: {
    schema: {
      type: 'json',
      schema: OrderSchema
    }
  }
};

commander.setMessageHandler(async (message) => {
  // Message is already validated
  console.log('Valid order:', message);
});
```

### Processing Hooks

Add hooks for retry lifecycle:

```typescript
commander.addHook({
  beforeRetry: async (message) => {
    console.log('Before retry:', {
      topic: message.metadata.originalTopic,
      retryCount: message.metadata.retryCount
    });
  },
  afterRetry: async (message) => {
    console.log('After retry:', {
      topic: message.metadata.originalTopic,
      retryCount: message.metadata.retryCount
    });
  }
});
```

### DLQ Handling

Handle messages that exceed retry attempts:

```typescript
commander.setDLQHandler(async (message) => {
  console.log('DLQ message:', {
    originalTopic: message.metadata.originalTopic,
    error: message.headers['x-error-message'],
    retryCount: message.metadata.retryCount
  });
});
```

### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  await commander.shutdown();
  process.exit(0);
});
```

## Configuration

### KafkaRetryCommanderConfig

```typescript
interface KafkaRetryCommanderConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  topics: string[];
  retryConfig: {
    maxRetries: number;
    initialDelay: number;
    backoffFactor: number;
    groupId: string;
    schema?: {
      type: 'json';
      schema: any;
    };
  };
}
```

### Retry Behavior

- Messages are retried with exponential backoff
- Retry delay = initialDelay * (backoffFactor ^ retryCount)
- After maxRetries, messages go to DLQ
- Each retry level has its own topic

## Best Practices

1. Always implement a DLQ handler
2. Use schema validation for message integrity
3. Implement proper error handling
4. Set up monitoring using hooks
5. Handle graceful shutdown

## Error Handling

The commander handles common scenarios:

- Invalid message format
- Schema validation failures
- Processing errors
- Network issues
- Kafka connection problems

## Contributing

Contributions welcome! Please read our contributing guidelines.

## License

MIT 