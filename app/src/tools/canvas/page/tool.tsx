import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import './style.css';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { CanvasToWebview } from '../shared/protocol';
import { BoardView } from './boardView';
import { CanvasStore, createCanvasStore } from './store';

export function CanvasTool({
  active,
  listen,
  views = noViews,
}: {
  active: boolean;
  listen: (handler: (message: CanvasToWebview) => void) => () => void;
  views?: ToolViews;
}) {
  const [store] = useState(() => createCanvasStore({}, views));
  const tab = useStore(store, (state) => state.tab);

  useEffect(() => listen(store.getState().receive), [listen, store]);
  useEffect(() => views.onRelease(store.getState().releaseTab), [views, store]);
  useEffect(() => {
    const flush = () => store.getState().keepTabs();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [store]);

  if (!active) {
    return null;
  }
  return (
    <CanvasStore value={store}>
      <div className="repository">
        <div className="columns board-columns">
          {tab === undefined ? (
            <section className="column board" />
          ) : (
            <BoardView key={tab} />
          )}
        </div>
      </div>
    </CanvasStore>
  );
}
