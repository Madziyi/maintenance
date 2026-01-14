# Sentry Error Tracking Setup

This project uses [Sentry](https://sentry.io/) for error tracking and performance monitoring in production.

## Setup

1. **Create a Sentry account** at https://sentry.io/
2. **Create a new project** and select "React" as the platform
3. **Get your DSN** from the project settings
4. **Add DSN to `.env` file**:

```env
VITE_SENTRY_DSN=https://your-dsn@sentry.io/project-id
VITE_APP_VERSION=1.0.0
```

## Configuration

Sentry is configured in `src/lib/sentry.ts` with the following features:

- **Error Tracking**: Automatically captures unhandled errors and React component errors
- **Performance Monitoring**: Tracks API call performance (10% sampling in production)
- **Release Tracking**: Associates errors with app versions
- **Environment Filtering**: Only sends errors in production (unless `VITE_SENTRY_ENABLE_DEV=true`)
- **Privacy Protection**: Filters out sensitive data (passwords, tokens) before sending

## What Gets Tracked

### Automatic Tracking
- Unhandled JavaScript errors
- React component errors (via Error Boundary)
- API errors (with context: endpoint, status code, response)
- Network failures

### Manual Tracking
You can manually track events:

```typescript
import * as Sentry from "@sentry/react";

// Track a message
Sentry.captureMessage("Something important happened", "info");

// Track an exception
Sentry.captureException(new Error("Custom error"));

// Add breadcrumbs
Sentry.addBreadcrumb({
  category: 'user',
  message: 'User clicked button',
  level: 'info',
});
```

## Error Filtering

The following errors are filtered out (not sent to Sentry):
- Errors in development mode (unless `VITE_SENTRY_ENABLE_DEV=true`)
- Network errors that are handled gracefully
- Errors from browser extensions

## Performance Monitoring

API calls are automatically tracked with:
- Request duration
- Success/failure status
- Endpoint information

Sampling rate:
- Development: 100% (all requests tracked)
- Production: 10% (to reduce overhead)

## Viewing Errors

1. Go to your Sentry dashboard: https://sentry.io/
2. Select your project
3. View errors in the "Issues" tab
4. Each error includes:
   - Stack trace
   - User context (if authenticated)
   - Browser/device information
   - Breadcrumbs (user actions leading to error)
   - Release version

## Best Practices

1. **Don't track sensitive data**: Passwords, tokens, and PII are automatically filtered
2. **Use tags for filtering**: Errors are tagged by endpoint, status, etc.
3. **Set up alerts**: Configure email/Slack alerts for critical errors
4. **Review regularly**: Check Sentry dashboard weekly for new issues
5. **Tag releases**: Update `VITE_APP_VERSION` with each deployment

## Disabling Sentry

To disable Sentry, simply don't set `VITE_SENTRY_DSN` in your `.env` file. The app will work normally without error tracking.
