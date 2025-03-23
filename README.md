# Kafka Retry Commander

A powerful and flexible Kafka message retry system for Node.js applications. Kafka Retry Commander provides a robust solution for handling message processing failures with automatic retries, dead-letter queues (DLQ), and customizable hooks.

## Features

- 🔄 **Smart Retry Mechanism**: Configurable retry attempts with exponential backoff
- 📬 **Dead Letter Queue**: Automatic handling of failed messages after max retries
- 🎯 **Schema Validation**: Built-in Zod schema validation for message integrity
- 🎭 **Custom Hooks**: Extensible hook system for monitoring and customizing retry behavior
- 📊 **Metrics Tracking**: Built-in metrics for monitoring retry attempts and processing times
- 🔧 **Flexible Configuration**: Customizable topic naming, retention periods, and processing options
- 🛡️ **Type Safety**: Full TypeScript support with comprehensive type definitions
- 📝 **Comprehensive Logging**: Detailed logging with Winston integration

## Installation

```bash
npm install kafka-retry-commander
# or
yarn add kafka-retry-commander
```

## Quick Start

```typescript
import { KafkaRetryCommander } from 'kafka-retry-commander';
import { z } from 'zod';

// Define your message schema
const messageSchema = z.object({
  id: z.string(),
  data: z.any(),
  timestamp: z.number()
});

// Create a consumer instance
const consumer = new KafkaRetryCommander({
  clientId: 'example-consumer',
  brokers: ['localhost:9092'],
  groupId: 'example-group',
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

// Set up message processing
consumer.setMessageHandler(async (message) => {
  // Process your message here
  await processMessage(message);
});

// Set up DLQ handling
consumer.setDLQHandler(async (message) => {
  // Handle failed messages here
  await handleDLQMessage(message);
});

// Connect and start processing
await consumer.connect();
await consumer.start();
```

## Configuration

### Basic Configuration

```typescript
const config = {
  clientId: 'my-consumer',
  brokers: ['localhost:9092'],
  groupId: 'my-group',
  topics: ['my-topic'],
  retryConfig: {
    maxRetries: 3,
    initialDelay: 1000,
    backoffFactor: 2
  }
};
```

### Advanced Configuration

```typescript
const config = {
  clientId: 'my-consumer',
  brokers: ['localhost:9092'],
  groupId: 'my-group',
  topics: ['my-topic'],
  retryConfig: {
    maxRetries: 3,
    initialDelay: 1000,
    backoffFactor: 2,
    schema: {
      type: 'json',
      schema: messageSchema
    },
    topics: {
      dlq: 'custom-dlq-topic',
      retry: (retryCount) => `custom-retry-topic-${retryCount}`
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
      level: 'info',
      customLogger: myCustomLogger
    }
  }
};
```

## Examples

### Basic Usage
See [examples/basic-usage.ts](examples/basic-usage.ts) for a simple implementation.

### Advanced Usage
See [examples/advanced-usage.ts](examples/advanced-usage.ts) for examples with custom hooks and metrics.

### Batch Processing
See [examples/batch-processing.ts](examples/batch-processing.ts) for batch message processing.

### Custom Topic Naming
See [examples/custom-topics.ts](examples/custom-topics.ts) for custom topic naming strategies.

## API Reference

### KafkaRetryCommander

The main class for handling Kafka message retries.

#### Constructor

```typescript
constructor(config: KafkaRetryCommanderConfig)
```

#### Methods

- `connect(): Promise<void>` - Connect to Kafka
- `start(): Promise<void>` - Start processing messages
- `shutdown(): Promise<void>` - Gracefully shutdown the consumer
- `setMessageHandler(handler: (message: any) => Promise<void>): void` - Set message processing handler
- `setDLQHandler(handler: (message: RetryMessage) => Promise<void>): void` - Set DLQ message handler
- `addHook(hook: RetryHook): void` - Add a custom hook
- `setMetrics(metrics: RetryMetrics): void` - Set custom metrics

### RetryHook

Interface for custom hooks:

```typescript
interface RetryHook {
  beforeRetry?(message: RetryMessage): Promise<void>;
  afterRetry?(message: RetryMessage, success: boolean): Promise<void>;
  beforeDLQ?(message: RetryMessage): Promise<void>;
  afterDLQ?(message: RetryMessage): Promise<void>;
}
```

### RetryMetrics

Interface for custom metrics:

```typescript
interface RetryMetrics {
  incrementRetryCount(topic: string): void;
  incrementDLQCount(topic: string): void;
  recordRetryLatency(topic: string, latency: number): void;
  recordProcessingTime(topic: string, time: number): void;
}
```

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details. 