import type { ReactNode } from 'react';

export function FloatingSearch({ children }: { children: ReactNode }) {
  return <div className="floating-search">{children}</div>;
}
