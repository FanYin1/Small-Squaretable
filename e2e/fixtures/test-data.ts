/**
 * Test Data Fixtures
 *
 * Provides reusable test data for E2E tests
 */

// Generate unique ID for test isolation
let testCounter = 0;
function generateTestId() {
  return `${Date.now()}-${++testCounter}-${Math.random().toString(36).substring(2, 8)}`;
}

// Function to generate unique user for registration tests
export function generateUniqueUser() {
  const id = generateTestId();
  return {
    email: `test-user-${id}@example.com`,
    password: 'TestPassword123!',
    name: `Test User ${id}`,
  };
}

export const testUsers = {
  // For registration tests - generates unique email each time
  get free() {
    return generateUniqueUser();
  },
  // For login tests - uses a stable email that can be pre-registered
  pro: {
    email: 'pro-test-user@example.com',
    password: 'TestPassword123!',
    name: 'Pro Test User',
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
