import type { CellReport } from '../shell/shared/cellGrid';

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
