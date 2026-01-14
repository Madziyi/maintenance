/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_AUTH_USERNAME?: string;
  readonly VITE_AUTH_PASSWORD?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_SENTRY_ENABLE_DEV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
