import type { KeyboardEventHandler, ReactNode } from 'react';

export function FloatingSearch({
  below = false,
  over = false,
  onKeyDown,
  children,
}: {
  below?: boolean;
  over?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        'floating-search',
        ...(below ? ['below'] : []),
        ...(over ? ['over'] : []),
      ].join(' ')}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
