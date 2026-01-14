import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from "@sentry/react";
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Report to Sentry
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    });
    
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorFallback error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  onReset: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, onReset }) => {
  const navigate = useNavigate();

  const handleGoHome = () => {
    onReset();
    navigate('/');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 max-w-2xl w-full p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="text-red-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Something went wrong</h1>
            <p className="text-slate-600 mt-1">An unexpected error occurred</p>
          </div>
        </div>

        {error && (
          <div className="bg-slate-50 rounded-lg p-4 mb-6">
            <p className="text-sm font-semibold text-slate-700 mb-2">Error details:</p>
            <p className="text-sm text-slate-600 font-mono break-all">{error.message}</p>
            {process.env.NODE_ENV === 'development' && error.stack && (
              <details className="mt-3">
                <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
                  Stack trace
                </summary>
                <pre className="mt-2 text-xs text-slate-600 overflow-auto max-h-64 p-2 bg-slate-100 rounded">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleGoHome}
            className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 transition-colors"
          >
            <Home size={18} />
            Go to Home
          </button>
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-6 py-3 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-colors"
          >
            <RefreshCw size={18} />
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
};
