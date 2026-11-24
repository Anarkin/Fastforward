import type { CellReport, Size } from '../shell/shared/cellGrid';
import type { Toward } from './cellFit';

export interface Fits {
  due(window: object, report: CellReport | undefined, size: Size): boolean;
  done(window: object, report: CellReport, size: Size): void;
}

const keyOf = ({ cell }: CellReport, size: Size) =>
  `${cell.width}x${cell.height} ${size.width}x${size.height}`;

export function fitsWhenMoved(): Fits {
  const fitted = new WeakMap<object, string>();
  return {
    due: (window, report, size) =>
      report !== undefined && fitted.get(window) !== keyOf(report, size),
    done: (window, report, size) => {
      fitted.set(window, keyOf(report, size));
    },
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
