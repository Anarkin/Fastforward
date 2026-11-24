import { cellReportOf, type CellReport, type Size } from '../shared/cellGrid';

export function cellReportWithin(
  screen: Size,
  cell: Size,
  ratio: number,
): CellReport | undefined {
  const pixels = (length: number) => Math.round(length * ratio);
  return cellReportOf({
    cell: { width: pixels(cell.width), height: pixels(cell.height) },
    screen: { width: pixels(screen.width), height: pixels(screen.height) },
  });
}
