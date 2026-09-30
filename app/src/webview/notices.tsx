import { useEffect } from 'react';
import { CloseIcon } from './icons';

export interface Notice {
  readonly id: number;
  readonly level: 'info' | 'error';
  readonly message: string;
}

const maxNotices = 4;
const infoShownFor = 8000;

export function addNotice(
  notices: readonly Notice[],
  notice: Notice,
): readonly Notice[] {
  return [
    ...notices.filter((shown) => shown.message !== notice.message),
    notice,
  ].slice(-maxNotices);
}

export function fading(notices: readonly Notice[]): number[] {
  return notices
    .filter((notice) => notice.level === 'info')
    .map((notice) => notice.id);
}

export function Notices({
  notices,
  onDismiss,
}: {
  notices: readonly Notice[];
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timers = fading(notices).map((id) =>
      setTimeout(() => onDismiss(id), infoShownFor),
    );
    return () => timers.forEach(clearTimeout);
  }, [notices, onDismiss]);

  if (notices.length === 0) {
    return null;
  }
  return (
    <div className="notices" role="status">
      {notices.map((notice) => (
        <div key={notice.id} className={`notice ${notice.level}`}>
          <span className="notice-message">{notice.message}</span>
          <button
            className="notice-close"
            title="Dismiss"
            onClick={() => onDismiss(notice.id)}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
