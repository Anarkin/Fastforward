import { Component, type ErrorInfo, type ReactNode } from 'react';
import { errorText } from './errors';
import { TitleBar } from './titleBar';

export function Crash({
  title,
  error,
  onReload,
}: {
  title: string;
  error: unknown;
  onReload: () => void;
}) {
  return (
    <div className="app">
      <TitleBar title={title} />
      <div className="crash">
        <div className="error-message">
          Something went wrong:{' '}
          {error instanceof Error ? error.message : String(error)}
        </div>
        <button onClick={onReload}>Reload</button>
      </div>
    </div>
  );
}

interface Props {
  readonly title: string;
  readonly onError: (message: string) => void;
  readonly children: ReactNode;
}

interface State {
  readonly crash?: { readonly error: unknown };
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = {};

  static getDerivedStateFromError(error: unknown): State {
    return { crash: { error } };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError(errorText(error) + (info.componentStack ?? ''));
  }

  override render() {
    const { crash } = this.state;
    return crash ? (
      <Crash
        title={this.props.title}
        error={crash.error}
        onReload={() => location.reload()}
      />
    ) : (
      this.props.children
    );
  }
}
