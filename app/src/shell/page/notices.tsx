import { useEffect, useState } from 'react';
import { CloseIcon, ErrorIcon } from '../../ui/icons';
import { strings } from '../../shared/strings';
import { useShell, useShellActions } from './store';

export interface Notice {
  readonly id: number;
  readonly level: 'info' | 'error';
  readonly message: string;
  readonly shownAt: number;
}

const readAtLeast = 6000;
const readAtMost = 15_000;
const readPerCharacter = 40;
const errorTimes = 3;
const errorAtLeast = 20_000;
const errorAtMost = 45_000;

export function shownFor({
  level,
  message,
}: Pick<Notice, 'level' | 'message'>): number {
  const read = Math.min(
    readAtMost,
    readAtLeast + readPerCharacter * message.length,
  );
  return level === 'info'
    ? read
    : Math.min(errorAtMost, Math.max(errorAtLeast, errorTimes * read));
}

export function fading(
  notices: readonly Notice[],
  now: number,
): { id: number; after: number }[] {
  return notices.map((notice) => ({
    id: notice.id,
    after: Math.max(0, notice.shownAt + shownFor(notice) - now),
  }));
}

export function Notices() {
  const notices = useShell((state) => state.notices);
  const { dismissNotice: onDismiss, restartNotices } = useShellActions();
  const [held, setHeld] = useState<number>();
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const gained = () => {
      setFocused(true);
      restartNotices();
    };
    const lost = () => setFocused(false);
    setFocused(document.hasFocus());
    window.addEventListener('focus', gained);
    window.addEventListener('blur', lost);
    return () => {
      window.removeEventListener('focus', gained);
      window.removeEventListener('blur', lost);
    };
  }, [restartNotices]);
  useEffect(() => {
    if (!focused) {
      return undefined;
    }
    const timers = fading(
      notices.filter((notice) => notice.id !== held),
      performance.now(),
    ).map(({ id, after }) => setTimeout(() => onDismiss(id), after));
    return () => timers.forEach(clearTimeout);
  }, [notices, onDismiss, held, focused]);

  return (
    <div className="notices" role="status">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`notice ${notice.level}`}
          onMouseEnter={() => setHeld(notice.id)}
          onMouseLeave={() => {
            setHeld(undefined);
            restartNotices([notice.id]);
          }}
        >
          {notice.level === 'error' && <ErrorIcon />}
          <span className="notice-message">{notice.message}</span>
          <button
            className="notice-close"
            title={strings.messages.dismiss}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onDismiss(notice.id)}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
