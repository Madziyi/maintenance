# Testing Guide

This project uses [Vitest](https://vitest.dev/) for unit testing and [Testing Library](https://testing-library.com/) for React component testing.

## Running Tests

```bash
# Run tests once
npm run test:run

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

Tests are located in the `src/` directory alongside the code they test, following the pattern:
- `src/api/api.test.ts` - Tests for API functions
- `src/components/**/*.test.tsx` - Tests for React components

## Writing Tests

### API Function Tests

Example test structure for API functions:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../api';

describe('API Function Name', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should handle success case', async () => {
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'test' }),
    });

    const result = await api.someFunction();
    expect(result).toEqual({ data: 'test' });
  });

  it('should handle error case', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Error message',
    });

    await expect(api.someFunction()).rejects.toThrow();
  });
});
```

### Component Tests

Example test structure for React components:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

## Test Coverage

The project aims for 70-80% code coverage on critical functions:
- API functions (100% coverage)
- Data transformation utilities
- Form validation logic
- Business logic functions

Coverage reports are generated in the `coverage/` directory when running `npm run test:coverage`.

## Best Practices

1. **Test critical paths first**: Focus on API calls, data transformations, and business logic
2. **Test edge cases**: Empty data, network failures, invalid input
3. **Mock external dependencies**: APIs, localStorage, timers
4. **Keep tests fast**: Use mocks instead of real API calls
5. **Use descriptive test names**: "should do X when Y" format
6. **Test behavior, not implementation**: Focus on what the code does, not how

## Environment Variables for Testing

Tests use mocked environment variables. The `vitest.config.ts` file handles test environment setup.
