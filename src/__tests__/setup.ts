// Increase timeout for all tests
jest.setTimeout(30000);

// Mock console methods to keep test output clean
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
});

afterAll(() => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
});

// Mock Kafka client
jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    consumer: jest.fn().mockReturnValue({
      connect: jest.fn(),
      disconnect: jest.fn(),
      subscribe: jest.fn(),
      run: jest.fn(),
      describeGroup: jest.fn()
    }),
    producer: jest.fn().mockReturnValue({
      connect: jest.fn(),
      disconnect: jest.fn(),
      send: jest.fn()
    })
  }))
}));

// Mock Redis client
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    quit: jest.fn()
  }));
});

// Mock OpenTelemetry
jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    shutdown: jest.fn()
  })),
  SimpleSpanProcessor: jest.fn(),
  ConsoleSpanExporter: jest.fn(),
  Resource: jest.fn()
}));

jest.mock('@opentelemetry/semantic-conventions', () => ({
  SemanticResourceAttributes: {
    SERVICE_NAME: 'service.name'
  }
})); 