import { Admin } from 'kafkajs';
import { RetryConfig, TopicConfig } from './types';

export class TopicManager {
  constructor(private admin: Admin) {}

  public async createTopics(topic: string, config: RetryConfig): Promise<void> {
    const topics: TopicConfig[] = [
      this.createTopicConfig(topic, config),
      ...this.createRetryTopicConfigs(topic, config),
      this.createDLQTopicConfig(topic, config)
    ];

    await this.admin.createTopics({
      topics: topics.map(t => ({
        topic: t.name,
        numPartitions: t.partitions || 1,
        replicationFactor: t.replicationFactor || 1,
        configEntries: t.config ? Object.entries(t.config).map(([key, value]) => ({ name: key, value })) : []
      }))
    });
  }

  public async deleteTopics(topic: string, config: RetryConfig): Promise<void> {
    const topics = [
      topic,
      ...Array.from({ length: config.maxRetries }, (_, i) => this.getRetryTopic(topic, i + 1, config)),
      this.getDLQTopic(topic, config)
    ];

    await this.admin.deleteTopics({
      topics
    });
  }

  public getRetryTopic(topic: string, retryCount: number, config: RetryConfig): string {
    if (config.topics?.retry) {
      if (typeof config.topics.retry === 'function') {
        return config.topics.retry(retryCount);
      }
      return config.topics.retry;
    }
    return `${topic}.retry.${retryCount}`;
  }

  public getDLQTopic(topic: string, config: RetryConfig): string {
    if (config.topics?.dlq) {
      return config.topics.dlq;
    }
    return `${topic}.dlq`;
  }

  private createTopicConfig(topic: string, config: RetryConfig): TopicConfig {
    return {
      name: topic,
      partitions: config.topicConfig?.partitions,
      replicationFactor: config.topicConfig?.replicationFactor
    };
  }

  private createRetryTopicConfigs(topic: string, config: RetryConfig): TopicConfig[] {
    return Array.from({ length: config.maxRetries }, (_, i) => ({
      name: this.getRetryTopic(topic, i + 1, config),
      partitions: config.topicConfig?.partitions,
      replicationFactor: config.topicConfig?.replicationFactor,
      config: config.topicConfig?.retention ? {
        'retention.ms': config.topicConfig.retention.retryTopics.toString()
      } : undefined
    }));
  }

  private createDLQTopicConfig(topic: string, config: RetryConfig): TopicConfig {
    return {
      name: this.getDLQTopic(topic, config),
      partitions: config.topicConfig?.partitions,
      replicationFactor: config.topicConfig?.replicationFactor,
      config: config.topicConfig?.retention ? {
        'retention.ms': config.topicConfig.retention.dlq.toString()
      } : undefined
    };
  }
} 