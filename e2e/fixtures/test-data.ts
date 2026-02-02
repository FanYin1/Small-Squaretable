/**
 * Test Data Fixtures
 *
 * Provides reusable test data for E2E tests
 */

export const testUsers = {
  free: {
    email: `free-user-${Date.now()}@example.com`,
    password: 'TestPassword123!',
  },
  pro: {
    email: `pro-user-${Date.now()}@example.com`,
    password: 'TestPassword123!',
  },
  existing: {
    email: 'existing@example.com',
    password: 'ExistingPassword123!',
  },
};

export const testCharacters = {
  basic: {
    name: 'Test Character',
    description: 'A test character for E2E testing',
    greeting: 'Hello! I am a test character.',
    personality: 'Friendly and helpful',
    scenario: 'Testing environment',
  },
  detailed: {
    name: 'Detailed Test Character',
    description: 'A detailed character with full configuration',
    greeting: 'Greetings! I am here to assist you with testing.',
    personality: 'Professional, thorough, and detail-oriented',
    scenario: 'Professional testing scenario with comprehensive coverage',
    firstMessage: 'Welcome to the test! How can I help you today?',
  },
};

export const testMessages = {
  simple: 'Hello, how are you?',
  complex: 'Can you help me understand the features of this application?',
  long: 'This is a longer message that tests the handling of extended text content. '.repeat(10),
};

export const invalidCredentials = {
  invalidEmail: {
    email: 'invalid-email',
    password: 'password123',
  },
  shortPassword: {
    email: 'test@example.com',
    password: '123',
  },
  wrongPassword: {
    email: 'test@example.com',
    password: 'WrongPassword123!',
  },
};
