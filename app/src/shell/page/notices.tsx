import { useEffect, useState } from 'react';
import { Card } from './card';
import { useShell, useShellActions } from './store';
import { fading } from './noticeFading';

export function Notices() {
  const notices = useShell((state) => state.notices);
  const times = useShell((state) => state.noticeTimes);
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
      times,
    ).map(({ id, after }) => setTimeout(() => onDismiss(id), after));
    return () => timers.forEach(clearTimeout);
  }, [notices, times, onDismiss, held, focused]);

  return (
    <div className="notices" role="status">
      {notices.map((notice) => (
        <Card
          key={notice.id}
          kind="notice"
          said={notice.message}
          error={notice.level === 'error'}
          onClose={() => onDismiss(notice.id)}
          onMouseEnter={() => setHeld(notice.id)}
          onMouseLeave={() => {
            setHeld(undefined);
            restartNotices([notice.id]);
          }}
        />
      ))}
    </div>
  );
}
