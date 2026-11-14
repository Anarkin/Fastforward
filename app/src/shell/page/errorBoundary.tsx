import {
  Component,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { errorText } from '../../lib/page/errors';
import type { ToWebview } from '../shared/protocol';
import { confirmation } from './App';
import { ConfirmPopup } from './confirmPopup';
import { TitleBar } from './titleBar';
import { strings } from '../../lib/shared/strings';

type Listen = (handler: (message: ToWebview) => void) => () => void;

export function Crash({
  title,
  error,
  onReload,
  listen,
  onQuit,
}: {
  title: string;
  error: unknown;
  onReload: () => void;
  listen: Listen;
  onQuit: () => void;
}) {
  const [asking, setAsking] = useState<{ readonly note?: string } | undefined>(
    undefined,
  );
  useEffect(
    () =>
      listen((message) => {
        if (message.type === 'confirmQuit') {
          setAsking(message.note === undefined ? {} : { note: message.note });
        }
      }),
    [listen],
  );
  return (
    <div className="app">
      <TitleBar title={title} />
      <div className="crash">
        <div className="error-message">
          {strings.app.crashed(
            error instanceof Error ? error.message : String(error),
          )}
        </div>
        <button onClick={onReload}>{strings.app.reload}</button>
      </div>
      {asking !== undefined && (
        <ConfirmPopup
          {...confirmation({ kind: 'quit', ...asking })}
          onConfirm={() => {
            setAsking(undefined);
            onQuit();
          }}
          onCancel={() => setAsking(undefined)}
        />
      )}
    </div>
  );
}

interface Props {
  readonly title: string;
  readonly onError: (message: string) => void;
  readonly listen: Listen;
  readonly onQuit: () => void;
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
        listen={this.props.listen}
        onQuit={this.props.onQuit}
      />
    ) : (
      this.props.children
    );
  }
}
