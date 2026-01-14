import * as Sentry from "@sentry/react";

export const initSentry = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  
  // Only initialize if DSN is provided
  if (!dsn) {
    console.warn("Sentry DSN not provided. Error tracking disabled.");
    return;
  }

  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration({
        // Set sampling rate for performance monitoring
        tracePropagationTargets: [
          "localhost",
          /^https:\/\/equiplocate\./,
          /^https:\/\/.*\.workers\.dev/,
        ],
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev
    
    // Release tracking
    release: import.meta.env.VITE_APP_VERSION || "unknown",
    environment: import.meta.env.MODE || "development",
    
    // Filter out noise
    beforeSend(event, hint) {
      // Don't send errors in development (unless explicitly enabled)
      if (import.meta.env.MODE === 'development' && !import.meta.env.VITE_SENTRY_ENABLE_DEV) {
        return null;
      }
      
      // Filter out known non-critical errors
      if (event.exception && hint?.originalException) {
        const error = hint.originalException as unknown;
        
        // Don't track network errors that are handled gracefully
        if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
          return null;
        }
        
        // Don't track errors from browser extensions
        if (error instanceof Error && error.stack?.includes("chrome-extension://")) {
          return null;
        }
      }
      
      return event;
    },
    
    // Add user context (without PII)
    beforeBreadcrumb(breadcrumb) {
      // Filter out sensitive data
      if (breadcrumb.data) {
        // Remove passwords, tokens, etc.
        if (breadcrumb.data.password) delete breadcrumb.data.password;
        if (breadcrumb.data.token) delete breadcrumb.data.token;
        if (breadcrumb.data.authorization) delete breadcrumb.data.authorization;
      }
      return breadcrumb;
    },
  });
};
