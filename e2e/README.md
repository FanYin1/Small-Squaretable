# E2E Testing Documentation

## Overview

This document describes the End-to-End (E2E) testing setup for the Small-Squaretable project using Playwright.

## Test Structure

```
e2e/
├── fixtures/           # Test data and fixtures
│   └── test-data.ts    # Reusable test data
├── pages/              # Page Object Models
│   ├── auth.page.ts    # Authentication pages
│   ├── chat.page.ts    # Chat interface
│   ├── character.page.ts # Character management
│   ├── market.page.ts  # Character market
│   └── subscription.page.ts # Subscription management
├── utils/              # Test utilities
│   └── helpers.ts      # Helper functions
├── auth.spec.ts        # Authentication flow tests
├── character.spec.ts   # Character management tests
├── chat.spec.ts        # Chat flow tests
├── subscription.spec.ts # Subscription flow tests
├── error-handling.spec.ts # Error handling tests
└── responsive.spec.ts  # Responsive design tests
```

## Test Coverage

### 1. Authentication Flow (`auth.spec.ts`)
- **User Registration**
  - Successful registration
  - Invalid email format validation
  - Password strength validation
  - Duplicate registration prevention

- **User Login**
  - Login with valid credentials
  - Invalid credentials handling
  - Non-existent user handling
  - Protected route redirection

- **User Logout**
  - Successful logout
  - Session cleanup
  - Post-logout route protection

- **Session Persistence**
  - Session persistence after reload
  - Session maintenance across navigation

### 2. Character Management (`character.spec.ts`)
- **Character Market**
  - Browse characters without authentication
  - Search functionality
  - Category filtering
  - Character detail viewing

- **Character Creation**
  - Create new character
  - Required field validation
  - Edit existing character
  - Delete character

- **Character Publishing (Feature Gate)**
  - Upgrade prompt for free users
  - Pro user publishing capability

- **Import/Export**
  - Export in SillyTavern format
  - Import from SillyTavern format

- **Ratings and Comments**
  - Display character ratings
  - User rating submission

### 3. Chat Flow (`chat.spec.ts`)
- **Chat Creation**
  - Create new chat
  - Display chat interface
  - Character selection

- **Message Sending**
  - Send simple messages
  - Display sent messages
  - Handle long messages
  - Prevent empty messages

- **AI Response - Streaming**
  - Receive AI responses
  - Display streaming indicator
  - Handle streaming errors

- **Chat History**
  - Display chat history
  - Switch between chats
  - Persist messages after reload
  - Create multiple chats

- **WebSocket Connection**
  - Establish WebSocket connection
  - Handle disconnection
  - Automatic reconnection

- **Usage Quota (Free User)**
  - Track message usage
  - Display quota warnings
  - Prevent messages when quota exceeded

### 4. Subscription Flow (`subscription.spec.ts`)
- **Subscription Page Access**
  - Display subscription page
  - Show current plan
  - Display usage statistics

- **Plan Comparison**
  - Display all plans
  - Toggle billing cycle (monthly/yearly)
  - Display plan features
  - Highlight current plan

- **Plan Upgrade**
  - Show upgrade buttons
  - Initiate upgrade process
  - Display upgrade benefits

- **Usage Tracking**
  - Display current usage
  - Show usage limits
  - Display usage percentage
  - Warn when approaching limit
  - Show quota exceeded message
  - Display usage reset date

- **Pro User Features**
  - Display Pro plan as active
  - Show higher usage limits
  - Display subscription end date
  - Show cancel subscription option

- **Subscription Management**
  - Cancel subscription
  - View billing history
  - Update payment method

- **Feature Gates**
  - Show locked features for free users
  - Display upgrade prompts

### 5. Error Handling (`error-handling.spec.ts`)
- **Network Errors**
  - Handle API errors gracefully
  - Handle slow network connections
  - Handle offline mode
  - Retry failed requests

- **Validation Errors**
  - Email format validation
  - Password strength validation
  - XSS attack prevention

- **Session Management**
  - Handle expired tokens
  - Handle concurrent sessions

- **Rate Limiting**
  - Handle rate limit errors

- **Browser Compatibility**
  - Work with localStorage disabled
  - Handle JavaScript errors gracefully

- **Data Integrity**
  - Prevent duplicate submissions
  - Handle malformed API responses

- **UI Edge Cases**
  - Handle very long inputs
  - Handle rapid navigation
  - Handle window resize

### 6. Responsive Design (`responsive.spec.ts`)
- **Mobile - Portrait**
  - Display mobile navigation
  - Allow login on mobile
  - Display market in mobile view
  - Allow chat on mobile
  - Handle mobile keyboard

- **Tablet - Landscape**
  - Display tablet layout
  - Display market grid
  - Allow touch interactions

- **Desktop - Various Resolutions**
  - 1920x1080 (Full HD)
  - 1366x768 (Laptop)
  - 2560x1440 (2K)
  - 3840x2160 (4K)

- **Orientation Changes**
  - Portrait to landscape transition
  - Landscape to portrait transition

## Running Tests

### Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

3. Ensure the application is configured:
```bash
cp .env.example .env
# Edit .env with your configuration
```

### Run All Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Run tests in UI mode (interactive)
npm run test:e2e:ui

# Run tests in debug mode
npm run test:e2e:debug
```

### Run Specific Test Suites

```bash
# Run only authentication tests
npx playwright test auth.spec.ts

# Run only chat tests
npx playwright test chat.spec.ts

# Run only character tests
npx playwright test character.spec.ts

# Run only subscription tests
npx playwright test subscription.spec.ts

# Run only error handling tests
npx playwright test error-handling.spec.ts

# Run only responsive tests
npx playwright test responsive.spec.ts
```

### Run Tests on Specific Browsers

```bash
# Run on Chromium only
npx playwright test --project=chromium

# Run on Mobile Chrome
npx playwright test --project="Mobile Chrome"

# Run on all browsers
npx playwright test --project=chromium --project=firefox --project=webkit
```

### Generate Test Report

```bash
# Generate HTML report
npx playwright show-report

# Generate JSON report
npx playwright test --reporter=json
```

## Test Configuration

### Environment Variables

Tests use the following environment variables:

- `BASE_URL`: Base URL of the application (default: `http://localhost:3000`)
- `CI`: Set to `true` in CI environment for optimized settings

### Playwright Configuration

Key configuration options in `playwright.config.ts`:

- **Timeout**: 30 seconds per test
- **Retries**: 2 retries in CI, 0 in local
- **Workers**: 1 worker in CI, parallel in local
- **Trace**: Captured on first retry
- **Screenshots**: Captured on failure
- **Video**: Retained on failure

## Page Object Model (POM)

Tests use the Page Object Model pattern to encapsulate page interactions:

### AuthPage
- `goto(path)`: Navigate to login/register page
- `fillCredentials(email, password)`: Fill authentication form
- `submit()`: Submit form
- `login(email, password)`: Complete login flow
- `register(email, password)`: Complete registration flow
- `logout()`: Logout user
- `isLoggedIn()`: Check if user is logged in
- `getToken()`: Get authentication token

### ChatPage
- `goto(chatId?)`: Navigate to chat page
- `sendMessage(message)`: Send a chat message
- `waitForResponse(timeout)`: Wait for AI response
- `getMessageCount()`: Get number of messages
- `getLastMessage()`: Get last message text
- `createNewChat()`: Create new chat
- `selectCharacter(name)`: Select character for chat
- `getChatHistory()`: Get chat history count
- `openChat(index)`: Open specific chat
- `isStreaming()`: Check if AI is streaming response

### CharacterPage
- `goto()`: Navigate to character management page
- `createCharacter(data)`: Fill character creation form
- `save()`: Save character
- `publish()`: Publish character
- `delete()`: Delete character
- `getCharacterCount()`: Get number of characters
- `editCharacter(index)`: Edit specific character
- `isUpgradePromptVisible()`: Check if upgrade prompt is shown

### MarketPage
- `goto()`: Navigate to market page
- `searchCharacter(query)`: Search for characters
- `filterByCategory(category)`: Filter by category
- `sortBy(option)`: Sort characters
- `getCharacterCount()`: Get number of characters
- `clickCharacter(index)`: Click on character card
- `clickCharacterByName(name)`: Click character by name
- `loadMore()`: Load more characters

### SubscriptionPage
- `goto()`: Navigate to subscription page
- `getCurrentPlan()`: Get current subscription plan
- `toggleBillingCycle()`: Toggle monthly/yearly billing
- `upgradeToPlan(name)`: Upgrade to specific plan
- `getUsageStats()`: Get usage statistics
- `cancelSubscription()`: Cancel subscription
- `isPlanActive(name)`: Check if plan is active

## Test Utilities

### Helper Functions

- `waitForNetworkIdle(page)`: Wait for network to be idle
- `clearSession(page)`: Clear cookies and storage
- `setAuthToken(page, token)`: Set authentication token
- `mockApiResponse(page, url, response)`: Mock API response
- `mockLLMStream(page, messages)`: Mock LLM streaming response
- `waitForElement(page, selector)`: Wait for element with retry
- `takeScreenshot(page, name)`: Take timestamped screenshot
- `simulateSlowNetwork(page)`: Simulate slow network
- `simulateOffline(page)`: Simulate offline mode
- `restoreOnline(page)`: Restore online mode
- `getConsoleErrors(page)`: Get console errors
- `checkAccessibility(page)`: Basic accessibility check

## Test Data

Test data is defined in `e2e/fixtures/test-data.ts`:

- **testUsers**: Test user credentials (free, pro, existing)
- **testCharacters**: Test character data (basic, detailed)
- **testMessages**: Test message content (simple, complex, long)
- **invalidCredentials**: Invalid credential combinations

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Best Practices

1. **Use Page Object Model**: Encapsulate page interactions in page objects
2. **Keep Tests Independent**: Each test should be able to run independently
3. **Use Meaningful Test Names**: Test names should describe what they test
4. **Clean Up After Tests**: Clear session and data after each test
5. **Mock External Services**: Mock LLM APIs and payment providers
6. **Handle Async Operations**: Always wait for network and UI updates
7. **Use Selectors Wisely**: Prefer data-testid over CSS selectors
8. **Test Happy and Sad Paths**: Test both success and error scenarios
9. **Keep Tests Fast**: Aim for tests to complete in < 5 minutes total
10. **Document Test Failures**: Add comments explaining complex test logic

## Troubleshooting

### Tests Failing Locally

1. **Check if server is running**: Tests expect server at `http://localhost:3000`
2. **Clear browser data**: Run `npx playwright clean`
3. **Update browsers**: Run `npx playwright install`
4. **Check environment variables**: Ensure `.env` is configured correctly

### Tests Timing Out

1. **Increase timeout**: Adjust timeout in `playwright.config.ts`
2. **Check network**: Ensure stable internet connection
3. **Mock slow APIs**: Mock external API calls

### Flaky Tests

1. **Add explicit waits**: Use `waitForNetworkIdle()` or `waitForElement()`
2. **Increase retry count**: Adjust retries in config
3. **Check for race conditions**: Ensure proper async handling

### Screenshots and Videos

Failed tests automatically capture:
- Screenshots: `playwright-report/screenshots/`
- Videos: `playwright-report/videos/`
- Traces: `playwright-report/traces/`

## Performance Metrics

Target metrics for E2E tests:

- **Total execution time**: < 5 minutes
- **Individual test time**: < 30 seconds
- **Test success rate**: > 95%
- **Flakiness rate**: < 5%

## Future Improvements

1. **Visual Regression Testing**: Add screenshot comparison tests
2. **Accessibility Testing**: Integrate axe-core for a11y testing
3. **Performance Testing**: Add Lighthouse CI integration
4. **API Contract Testing**: Add API schema validation
5. **Load Testing**: Add concurrent user simulation
6. **Cross-browser Testing**: Expand to Firefox and Safari
7. **Mobile Device Testing**: Test on real mobile devices
8. **Internationalization Testing**: Test multiple languages

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Page Object Model Pattern](https://playwright.dev/docs/pom)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [CI/CD Integration](https://playwright.dev/docs/ci)
