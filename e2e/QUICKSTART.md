# E2E Testing Quick Start Guide

## Prerequisites

Before running E2E tests, ensure you have:

1. **Node.js 20+** installed
2. **PostgreSQL 15+** running
3. **Redis 7+** running
4. **Environment variables** configured

## Setup (First Time)

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Playwright Browsers

```bash
npx playwright install chromium
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/sillytavern_saas
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
PORT=3000
```

### 4. Run Database Migrations

```bash
npm run db:migrate
```

## Running Tests

### Run All E2E Tests

```bash
npm run test:e2e
```

This will:
- Start the development server automatically
- Run all E2E tests in headless mode
- Generate an HTML report

### Run Tests in Headed Mode (See Browser)

```bash
npm run test:e2e:headed
```

### Run Tests in UI Mode (Interactive)

```bash
npm run test:e2e:ui
```

This opens an interactive UI where you can:
- Select specific tests to run
- See test execution in real-time
- Debug failing tests
- View test traces

### Run Tests in Debug Mode

```bash
npm run test:e2e:debug
```

This opens Playwright Inspector for step-by-step debugging.

### Run Specific Test Files

```bash
# Authentication tests only
npx playwright test auth.spec.ts

# Chat tests only
npx playwright test chat.spec.ts

# Character tests only
npx playwright test character.spec.ts

# Subscription tests only
npx playwright test subscription.spec.ts

# Error handling tests only
npx playwright test error-handling.spec.ts

# Responsive design tests only
npx playwright test responsive.spec.ts
```

### Run Specific Test Cases

```bash
# Run tests matching a pattern
npx playwright test -g "should login"

# Run tests in a specific file matching a pattern
npx playwright test auth.spec.ts -g "User Registration"
```

## View Test Results

### HTML Report

After tests complete, view the HTML report:

```bash
npm run test:e2e:report
```

This opens an interactive report showing:
- Test results (passed/failed)
- Test duration
- Screenshots of failures
- Videos of failures
- Trace files for debugging

### Console Output

Test results are also displayed in the console with:
- ✓ Passed tests (green)
- ✗ Failed tests (red)
- ⊘ Skipped tests (yellow)
- Test duration
- Summary statistics

## Debugging Failed Tests

### 1. View Screenshots

Failed tests automatically capture screenshots:

```
playwright-report/screenshots/
```

### 2. View Videos

Failed tests automatically record videos:

```
playwright-report/videos/
```

### 3. View Traces

Traces are captured on first retry:

```
playwright-report/traces/
```

Open traces in Playwright Trace Viewer:

```bash
npx playwright show-trace playwright-report/traces/trace.zip
```

### 4. Run Single Test in Debug Mode

```bash
npx playwright test auth.spec.ts -g "should login" --debug
```

This opens Playwright Inspector where you can:
- Step through test execution
- Inspect page state
- View console logs
- Modify selectors

## Common Issues

### Issue: Tests Timeout

**Solution:**
- Ensure server is running on port 3000
- Check database and Redis are accessible
- Increase timeout in `playwright.config.ts`

### Issue: Server Not Starting

**Solution:**
- Check if port 3000 is already in use
- Verify environment variables are set
- Check database connection

### Issue: Tests Fail Locally but Pass in CI

**Solution:**
- Clear browser cache: `npx playwright clean`
- Update browsers: `npx playwright install`
- Check for timing issues (add explicit waits)

### Issue: Flaky Tests

**Solution:**
- Add `waitForNetworkIdle()` before assertions
- Use `waitForElement()` instead of fixed timeouts
- Check for race conditions

## Test Data

Tests use fixtures defined in `e2e/fixtures/test-data.ts`:

- **Test Users**: Pre-defined user credentials
- **Test Characters**: Sample character data
- **Test Messages**: Sample chat messages

Tests create unique users with timestamps to avoid conflicts.

## Mocking External Services

Tests mock external services to avoid dependencies:

### Mock LLM API

```typescript
await mockLLMStream(page, ['Hello', ' there', '!']);
```

### Mock Stripe API

```typescript
await mockApiResponse(page, '**/api/v1/subscriptions/checkout', {
  success: true,
  data: { checkoutUrl: 'https://checkout.stripe.com/test' }
});
```

## Performance Tips

1. **Run tests in parallel**: Default in local mode
2. **Run specific tests**: Don't run all tests every time
3. **Use headed mode sparingly**: Headless is faster
4. **Mock slow APIs**: Mock external services
5. **Clean up test data**: Remove old test users/chats

## CI/CD Integration

Tests run automatically in GitHub Actions on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

View results in GitHub Actions tab.

## Next Steps

1. **Write more tests**: Add tests for new features
2. **Improve coverage**: Aim for 80%+ coverage
3. **Add visual regression**: Compare screenshots
4. **Add accessibility tests**: Integrate axe-core
5. **Add performance tests**: Integrate Lighthouse

## Resources

- [Full E2E Documentation](./README.md)
- [Playwright Documentation](https://playwright.dev/)
- [Test Examples](./auth.spec.ts)
- [Page Objects](./pages/)

## Support

For issues or questions:
1. Check [E2E README](./README.md)
2. Review [Playwright docs](https://playwright.dev/)
3. Check test output and traces
4. Ask in project chat/issues
