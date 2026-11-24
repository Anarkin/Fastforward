import type { CellReport, Size } from '../shell/shared/cellGrid';
import type { Toward } from './cellFit';

export function cellsChanged(): (
  window: object,
  report: CellReport | undefined,
) => boolean {
  const fitted = new WeakMap<object, string>();
  return (window, report) => {
    if (report === undefined) {
      return false;
    }
    const key = `${report.cell.width}x${report.cell.height}`;
    if (fitted.get(window) === key) {
      return false;
    }
    fitted.set(window, key);
    return true;
  };
}

export function fitToward(): (window: object, cell: Size) => Toward {
  const fitted = new WeakMap<object, string>();
  return (window, cell) => {
    const key = `${cell.width}x${cell.height}`;
    const before = fitted.get(window);
    fitted.set(window, key);
    return before !== undefined && before !== key ? 'near' : 'down';
  };
}
