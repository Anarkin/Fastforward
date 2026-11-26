import { useLayoutEffect, useRef } from 'react';
import { watchGpu } from '../../../components/cells/page/gpuDevice';
import { useCellTable } from '../../../lib/page/cellTable';
import { watchDevicePixels } from '../../../lib/page/devicePixels';
import { Words } from '../../../lib/page/name';
import { PathTitle } from '../../../lib/page/pathTitle';
import { boardShown } from './state';
import { useCanvas } from './store';
import { BoardSurface, probeRowClass } from './surface';

export function BoardView() {
  const file = useCanvas((state) => state.file);
  const error = useCanvas((state) => boardShown(state)?.error);
  const board = useCanvas((state) => boardShown(state)?.board);
  const table = useCellTable();
  const body = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = body.current;
    const hosting = host.current;
    const measuring = probe.current;
    if (
      element === null ||
      hosting === null ||
      measuring === null ||
      board === undefined ||
      table === undefined
    ) {
      return undefined;
    }
    const surface = new BoardSurface(hosting, element, measuring);
    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => surface.draw(board, table));
    };
    surface.draw(board, table);
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change', draw);
    const unwatchGpu = watchGpu(draw);
    const unwatchPixels = watchDevicePixels(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scheme.removeEventListener('change', draw);
      unwatchGpu();
      unwatchPixels();
      surface.dispose();
    };
  }, [board, table]);

  return (
    <section className="column board">
      <div className="path-row">
        {file !== undefined && <PathTitle path={file} file />}
      </div>
      <div className="column-body board-body" ref={body}>
        <div className="board-host" ref={host} />
        <div className={probeRowClass} ref={probe} aria-hidden="true" />
        {error !== undefined && (
          <div className="board-error">
            <Words>{error}</Words>
          </div>
        )}
      </div>
    </section>
  );
}
