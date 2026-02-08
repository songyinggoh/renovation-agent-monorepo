'use client';

import { Component, type ReactNode } from 'react';

interface ToolErrorBoundaryProps {
  children: ReactNode;
  messageId?: string;
}

interface ToolErrorBoundaryState {
  hasError: boolean;
  showRawData: boolean;
  error: Error | null;
}

/**
 * Error boundary that catches render errors in tool result components.
 * Prevents the entire chat from crashing if tool data is malformed.
 */
export class ToolErrorBoundary extends Component<ToolErrorBoundaryProps, ToolErrorBoundaryState> {
  constructor(props: ToolErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, showRawData: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ToolErrorBoundaryState> {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(
    props: ToolErrorBoundaryProps,
    state: ToolErrorBoundaryState
  ): Partial<ToolErrorBoundaryState> | null {
    // Reset error state when messageId changes (new message)
    if (state.hasError) {
      return null;
    }
    return null;
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-destructive/30 bg-card p-3 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Failed to display tool result
            </p>
            <button
              onClick={() => this.setState((prev) => ({ showRawData: !prev.showRawData }))}
              className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
            >
              {this.state.showRawData ? 'Hide details' : 'Show details'}
            </button>
            {this.state.showRawData && this.state.error && (
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
