import { useLayoutEffect, useRef } from 'react';
import { watchDevicePixels } from '../../lib/page/devicePixels';
import type { CellReport } from '../shared/cellGrid';
import { cellReportWithin } from './cellGridReport';

export function CellGridProbe({
  onGrid,
}: {
  onGrid: (grid: CellReport) => void;
}) {
  const screen = useRef<HTMLDivElement>(null);
  const cell = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const screenElement = screen.current;
    const cellElement = cell.current;
    const view = screenElement?.ownerDocument.defaultView;
    if (
      !screenElement ||
      !cellElement ||
      !view ||
      view.ResizeObserver === undefined
    ) {
      return undefined;
    }
    let told = '';
    const measure = () => {
      const grid = cellReportWithin(
        screenElement.getBoundingClientRect(),
        cellElement.getBoundingClientRect(),
        view.devicePixelRatio,
      );
      const key = JSON.stringify(grid);
      if (grid !== undefined && key !== told) {
        told = key;
        onGrid(grid);
      }
    };
    const observer = new view.ResizeObserver(measure);
    observer.observe(screenElement);
    observer.observe(cellElement);
    const unwatched = watchDevicePixels(measure, view);
    view.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      unwatched();
      view.removeEventListener('resize', measure);
    };
  }, [onGrid]);
  return (
    <div className="cell-grid-probe" aria-hidden="true">
      <div className="repository">
        <div className="columns terminal-columns">
          <div className="cell-grid-column">
            <section className="column terminal">
              <div className="column-body terminal-panel">
                <div className="cell-grid-screen" ref={screen} />
                <span className="cell-grid-cell" ref={cell} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
