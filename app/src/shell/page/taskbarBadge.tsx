import { useEffect, useRef } from 'react';
import { ToolIcon } from '../../lib/page/icons';
import { watchScheme } from '../../lib/page/colorScheme';
import { groundUnder } from '../../components/cells/page/cellLook';
import { cssOf } from '../../components/cells/page/cellColors';
import { badgeImageOf } from './badgeImage';
import { soleToolOf } from './selectors';
import { useShell, useShellActions } from './store';

export function TaskbarBadge() {
  const known = useShell((state) => state.tabs !== undefined);
  const soleTool = useShell(soleToolOf);
  const { badgeTaskbar } = useShellActions();
  const source = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const icon = source.current?.querySelector('svg');
    const ground = source.current?.parentElement;
    if (soleTool === undefined || !icon || !ground) {
      if (known) {
        badgeTaskbar();
      }
      return undefined;
    }
    let drawn = 0;
    const draw = () => {
      const drawing = ++drawn;
      void badgeImageOf(icon, cssOf(groundUnder(ground)))
        .catch(() => undefined)
        .then((png) => {
          if (drawing === drawn) {
            badgeTaskbar(soleTool, png);
          }
        });
    };
    draw();
    const unwatch = watchScheme(draw);
    return () => {
      drawn += 1;
      unwatch();
    };
  }, [known, soleTool, badgeTaskbar]);
  return soleTool === undefined ? null : (
    <span ref={source} hidden>
      <ToolIcon tool={soleTool} pixelRatio={1} />
    </span>
  );
}
