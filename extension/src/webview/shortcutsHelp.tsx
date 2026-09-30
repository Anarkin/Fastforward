import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useDismiss } from './contextMenu';
import { HelpIcon } from './icons';
import { shortcuts } from './shortcuts';

const peekDelay = 300;
const unpeekDelay = 200;

export type PeekMode = 'closed' | 'peek' | 'open';

export function holdsDismissLayer(mode: PeekMode): boolean {
  return mode === 'open';
}

export function nextPeekMode(
  mode: PeekMode,
  action: 'rest' | 'leave',
): PeekMode {
  if (action === 'rest') {
    return mode === 'closed' ? 'peek' : mode;
  }
  return mode === 'peek' ? 'closed' : mode;
}

function usePeek() {
  const [mode, setMode] = useState<PeekMode>('closed');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const current = timer;
    return () => clearTimeout(current.current);
  }, []);
  const close = useCallback(() => {
    clearTimeout(timer.current);
    setMode('closed');
  }, []);
  return {
    mode,
    startPeek: () => {
      clearTimeout(timer.current);
      const next = nextPeekMode(mode, 'rest');
      if (next !== mode) {
        timer.current = setTimeout(() => setMode(next), peekDelay);
      }
    },
    endPeek: () => {
      clearTimeout(timer.current);
      const next = nextPeekMode(mode, 'leave');
      if (next !== mode) {
        timer.current = setTimeout(() => setMode(next), unpeekDelay);
      }
    },
    open: () => {
      clearTimeout(timer.current);
      setMode('open');
    },
    close,
  };
}

export function ShortcutsHelp() {
  const { mode, startPeek, endPeek, open, close } = usePeek();
  const container = useRef<HTMLDivElement>(null);
  const button = (
    <button
      className="nav-button"
      aria-label="Keyboard shortcuts"
      aria-expanded={mode !== 'closed'}
      onClick={mode === 'open' ? close : open}
    >
      <HelpIcon />
    </button>
  );
  return (
    <div
      className="shortcuts"
      ref={container}
      onPointerEnter={startPeek}
      onPointerLeave={endPeek}
    >
      {button}
      {mode !== 'closed' && (
        <ShortcutsPanel
          container={container}
          onClose={close}
          dismissable={holdsDismissLayer(mode)}
        >
          {button}
        </ShortcutsPanel>
      )}
    </div>
  );
}

export function ShortcutsPanel({
  container,
  onClose,
  dismissable,
  children,
}: {
  container: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  dismissable: boolean;
  children: React.ReactNode;
}) {
  useDismiss(container, onClose, { enabled: dismissable });
  return (
    <div className="shortcuts-panel">
      <div className="shortcuts-header">
        <div className="shortcuts-title">Keyboard shortcuts</div>
        {children}
      </div>
      <dl className="shortcuts-list">
        {shortcuts.map((shortcut) => (
          <Fragment key={shortcut.id}>
            <dt>
              <kbd>{shortcut.key.toUpperCase()}</kbd>
            </dt>
            <dd>{shortcut.description}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
