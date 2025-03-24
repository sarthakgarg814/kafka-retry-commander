import { Kafka, Consumer, Producer, Admin, EachMessagePayload } from 'kafkajs';
import { createLogger, Logger, format, transports } from 'winston';
import {
  RetryContext,
  RetryConfig,
  RetryMessage,
  KafkaRetryCommanderConfig,
  RetryMetrics,
  RetryHook
} from './types';
import { TopicManager } from './TopicManager';

export class KafkaRetryCommander {
  private kafka: Kafka;
  private consumer: Consumer;
  private producer: Producer;
  private admin: Admin;
  private context: RetryContext;
  private topicManager: TopicManager;
  private logger: Logger;
  private isShuttingDown: boolean = false;
  private hooks: RetryHook[] = [];
  private metrics?: RetryMetrics;
  private dlqHandler?: (message: RetryMessage) => Promise<void>;
  private messageHandler?: (message: RetryMessage) => Promise<void>;

  constructor(config: KafkaRetryCommanderConfig) {
    const kafkaConfig = {
      brokers: config.brokers,
      clientId: config.clientId,
      ssl: config.ssl,
      sasl: config.sasl,
      connectionTimeout: config.connectionTimeout,
      authenticationTimeout: config.authenticationTimeout,
      retry: config.retry
    };

    this.kafka = new Kafka(kafkaConfig);
    this.consumer = this.kafka.consumer({ groupId: config.groupId });
    this.producer = this.kafka.producer();
    this.admin = this.kafka.admin();
    this.topicManager = new TopicManager(this.admin);
    this.logger = this.initializeLogger(config.retryConfig);

    this.context = {
      kafka: this.kafka,
      consumer: this.consumer,
      producer: this.producer,
      logger: this.logger,
      metrics: config.retryConfig.metrics,
      hooks: config.retryConfig.hooks,
      config
    };
  }

  private initializeLogger(config: RetryConfig): Logger {
    if (config.logging?.customLogger) {
      return config.logging.customLogger;
    }

    return createLogger({
      level: config.logging?.level || 'info',
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      transports: [
        new transports.Console()
      ]
    });
  }

  public async connect(): Promise<void> {
    try {
      await this.producer.connect();
      await this.consumer.connect();
      
      // Create topics including retry and DLQ topics
      for (const topic of this.context.config.topics) {
        await this.topicManager.createTopics(topic, this.context.config.retryConfig);
      }

      // Subscribe to main topics
      const allTopics = this.context.config.topics.flatMap(topic => [
        topic,
        ...Array.from(
          { length: this.context.config.retryConfig.maxRetries }, 
          (_, i) => this.topicManager.getRetryTopic(topic, i + 1, this.context.config.retryConfig)
        ),
        this.topicManager.getDLQTopic(topic, this.context.config.retryConfig)
      ]);

      for (const topic of allTopics) {
        await this.consumer.subscribe({ topic, fromBeginning: false });
      }

      this.logger.info('Successfully connected to Kafka', { topics: allTopics });
    } catch (error) {
      this.logger.error('Failed to connect to Kafka', { error });
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          if (this.isShuttingDown) {
            return;
          }

          this.logger.debug('Processing message', {
            topic: payload.topic,
            partition: payload.partition,
            offset: payload.message.offset
          });

          try {
            // Check if this is a DLQ message
            const isDLQ = this.context.config.topics.some(topic => 
              this.topicManager.getDLQTopic(topic, this.context.config.retryConfig) === payload.topic
            );

            if (isDLQ) {
              await this.processDLQMessage(payload);
            } else {
              await this.processMessage(payload);
            }

            this.logger.debug('Successfully processed message', {
              topic: payload.topic,
              partition: payload.partition,
              offset: payload.message.offset
            });
          } catch (error) {
            this.logger.error('Failed to process message', {
              error,
              topic: payload.topic,
              partition: payload.partition,
              offset: payload.message.offset
            });

            if (this.context.config.errorHandler) {
              await this.context.config.errorHandler(error as Error, payload);
            }
          }
        }
      });

      this.logger.info('Consumer started successfully');
    } catch (error) {
      this.logger.error('Failed to start consumer', { error });
      throw error;
    }
  }

  private async processDLQMessage(payload: EachMessagePayload): Promise<void> {
    if (!this.dlqHandler) {
      this.logger.warn('DLQ handler not set, skipping DLQ message processing');
      return;
    }

    const retryCount = payload.message.headers?.['x-retry-count'];
    const errorMessage = payload.message.headers?.['x-error-message'];
    const errorStack = payload.message.headers?.['x-error-stack'];

    // Convert headers to Record<string, string>
    const headers: Record<string, string> = {};
    if (payload.message.headers) {
      Object.entries(payload.message.headers).forEach(([key, value]) => {
        headers[key] = value?.toString() || '';
      });
    }

    const retryMessage: RetryMessage = {
      key: payload.message.key?.toString() || '',
      value: payload.message.value,
      headers,
      metadata: {
        retryCount: retryCount ? parseInt(retryCount.toString()) : 0,
        lastRetryTimestamp: Date.now(),
        nextRetryTimestamp: Date.now(),
        originalTopic: payload.topic,
        originalPartition: payload.partition,
        originalOffset: payload.message.offset,
        error: errorMessage?.toString(),
        errorStack: errorStack?.toString()
      }
    };

    // Filter hooks that have DLQ handlers
    const beforeDLQHooks = this.context.hooks?.filter(hook => hook.beforeDLQ) || [];
    const afterDLQHooks = this.context.hooks?.filter(hook => hook.afterDLQ) || [];

    try {
      // Call beforeDLQ hooks
      for (const hook of beforeDLQHooks) {
        await hook.beforeDLQ!(retryMessage);
      }

      // Process DLQ message
      await this.dlqHandler(retryMessage);

      // Call afterDLQ hooks
      for (const hook of afterDLQHooks) {
        await hook.afterDLQ!(retryMessage);
      }
    } catch (error) {
      this.logger.error('Error in DLQ hooks or handler', { error });
      throw error;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async validateMessage(message: any, schema: RetryConfig['schema']): Promise<void> {
    if (!schema) return;

    try {
      await schema.schema.parse(message);
    } catch (error) {
      this.logger.error('Schema validation failed', { error });
      throw new Error(`Schema validation failed: ${(error as Error).message}`);
    }
  }

  private async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const value = message.value ? JSON.parse(message.value.toString()) : null;

    try {
      await this.validateMessage(value, this.context.config.retryConfig.schema);

      const retryCount = parseInt(message.headers?.['x-retry-count']?.toString() || '0');
      const nextRetryTimestamp = parseInt(message.headers?.['x-next-retry-timestamp']?.toString() || '0');

      // Check if it's a retry message and not yet ready to process
      if (retryCount > 0 && nextRetryTimestamp > Date.now()) {
        // Pause the partition until the message is ready
        await this.consumer.pause([{ topic, partitions: [partition] }]);
        
        // Schedule resume after delay
        setTimeout(async () => {
          await this.consumer.resume([{ topic, partitions: [partition] }]);
        }, nextRetryTimestamp - Date.now());
        
        return;
      }

      const retryMessage: RetryMessage = {
        key: message.key?.toString() || '',
        value,
        headers: message.headers as Record<string, string>,
        metadata: {
          retryCount,
          lastRetryTimestamp: Date.now(),
          nextRetryTimestamp,
          originalTopic: message.headers?.['x-original-topic']?.toString() || topic,
          originalPartition: partition,
          originalOffset: message.offset
        }
      };

      // Process hooks and message
      const beforeRetryHooks = this.context.hooks?.filter(hook => hook.beforeRetry) || [];
      const afterRetryHooks = this.context.hooks?.filter(hook => hook.afterRetry) || [];

      try {
        // Call beforeRetry hooks
        for (const hook of beforeRetryHooks) {
          await hook.beforeRetry!(retryMessage);
        }

        // Process message using user's handler
        if (this.messageHandler) {
          await this.messageHandler(value);
        }

        // Call afterRetry hooks with success
        for (const hook of afterRetryHooks) {
          await hook.afterRetry!(retryMessage, true);
        }
      } catch (error) {
        // Handle retry logic
        const maxRetries = this.context.config.retryConfig.maxRetries || 3;
        const retryDelay = this.context.config.retryConfig.initialDelay || 1000;

        // Call afterRetry hooks with failure
        for (const hook of afterRetryHooks) {
          await hook.afterRetry!(retryMessage, false);
        }

        if (retryCount >= maxRetries) {
          // Send to DLQ
          const dlqTopic = this.topicManager.getDLQTopic(
            retryMessage.metadata.originalTopic, 
            this.context.config.retryConfig
          );
          
          await this.producer.send({
            topic: dlqTopic,
            messages: [{
              key: message.key,
              value: message.value,
              headers: {
                ...message.headers,
                'x-retry-count': retryCount.toString(),
                'x-error-message': (error as Error).message,
                'x-error-stack': (error as Error).stack,
                'x-original-topic': retryMessage.metadata.originalTopic,
                'x-failed-at': new Date().toISOString()
              }
            }]
          });
        } else {
          // Send to next retry topic
          const nextRetryLevel = retryCount + 1;
          const nextRetry = Date.now() + (retryDelay * Math.pow(this.context.config.retryConfig.backoffFactor, retryCount));
          
          const retryTopic = this.topicManager.getRetryTopic(
            retryMessage.metadata.originalTopic,
            nextRetryLevel,
            this.context.config.retryConfig
          );
          
          await this.producer.send({
            topic: retryTopic,
            messages: [{
              key: message.key,
              value: message.value,
              headers: {
                ...message.headers,
                'x-retry-count': nextRetryLevel.toString(),
                'x-next-retry-timestamp': nextRetry.toString(),
                'x-error-message': (error as Error).message,
                'x-original-topic': retryMessage.metadata.originalTopic,
                'x-last-retry': new Date().toISOString()
              }
            }]
          });
        }

        // Update metrics if configured
        if (this.context.metrics) {
          this.context.metrics.incrementRetryCount(topic);
        }

        throw error; // Re-throw for error handling
      }
    } catch (error) {
      this.logger.error('Failed to process message', {
        error,
        topic,
        partition,
        offset: message.offset
      });

      if (this.context.config.errorHandler) {
        await this.context.config.errorHandler(error as Error, payload);
      }
    }
  }

  public async shutdown(): Promise<void> {
    this.logger.info('Initiating graceful shutdown');
    this.isShuttingDown = true;

    try {
      await this.consumer.disconnect();
      await this.producer.disconnect();
      await this.admin.disconnect();
      this.logger.info('Successfully disconnected from Kafka');
    } catch (error) {
      this.logger.error('Error during shutdown', { error });
      throw error;
    }
  }

  public addHook(hook: RetryHook): void {
    if (!this.context.hooks) {
      this.context.hooks = [];
    }
    this.context.hooks.push(hook);
  }

  public setDLQHandler(handler: (message: RetryMessage) => Promise<void>): void {
    this.dlqHandler = handler;
  }

  public setMetrics(metrics: RetryMetrics): void {
    this.metrics = metrics;
  }

  public setMessageHandler(handler: (message: RetryMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }
} 
