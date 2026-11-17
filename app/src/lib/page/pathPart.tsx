import type { ReactNode } from 'react';
import type { ShownPart } from './pathLooks';

export function PathPart({
  part,
  className,
  children,
}: {
  readonly part: ShownPart;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <span
      className={
        className === undefined
          ? part.className
          : `${className} ${part.className}`
      }
      style={part.style}
    >
      {children}
    </span>
  );
}
