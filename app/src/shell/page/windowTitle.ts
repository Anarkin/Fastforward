import { useEffect } from 'react';
import { strings } from '../../lib/shared/strings';

export function windowTitle(root: string | undefined, app: string): string {
  return root === undefined ? app : strings.app.windowTitle(root, app);
}

export function useWindowTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
