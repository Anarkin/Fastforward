import { useEffect, useState } from 'react';
import { CloseIcon, ErrorIcon } from '../../lib/page/icons';
import { Words } from '../../lib/page/name';
import { strings } from '../../lib/shared/strings';
import { useShell, useShellActions } from './store';
import { fading } from './noticeFading';

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
          <span className="notice-message">
            <Words>{notice.message}</Words>
          </span>
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
