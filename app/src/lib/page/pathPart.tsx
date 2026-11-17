import { useContext, type ReactNode } from 'react';
import type { ShownPart } from './pathLooks';
import { PathMenuContext } from './pathMenu';
import { keymap } from './keymap';
import { clicked } from '../shared/keymap';

export function PathPart({
  part,
  className,
  menu = true,
  onGoTo,
  children,
}: {
  readonly part: ShownPart;
  readonly className?: string;
  readonly menu?: boolean;
  readonly onGoTo?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  const openMenu = useContext(PathMenuContext);
  return (
    <span
      className={
        className === undefined
          ? part.className
          : `${className} ${part.className}`
      }
      style={part.style}
      onContextMenu={
        menu
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              openMenu({
                path: part.whole,
                file: part.file,
                at: { x: event.clientX, y: event.clientY },
                extended: clicked(keymap.systemMenu, event) !== undefined,
                ...(onGoTo !== undefined && { onGoTo }),
              });
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}
