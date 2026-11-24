import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import './style.css';
import { useBinding } from '../../../lib/page/shortcuts';
import { useShellActions } from '../../../shell/page/store';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { ViewerToHost, ViewerToWebview } from '../shared/protocol';
import { Viewer } from './viewer';
import { viewerKeymap } from './keymap';
import { createViewerStore, ViewerStore } from './store';

export function ViewerTool({
  active,
  post,
  listen,
  views = noViews,
}: {
  active: boolean;
  post: (message: ViewerToHost) => void;
  listen: (handler: (message: ViewerToWebview) => void) => () => void;
  views?: ToolViews;
}) {
  const [store] = useState(() => createViewerStore(post, {}, views));
  const tab = useStore(store, (state) => state.tab);
  const { closeTab } = useShellActions();

  useEffect(() => listen(store.getState().receive), [listen, store]);
  useEffect(() => views.onRelease(store.getState().releaseTab), [views, store]);
  useEffect(() => {
    const flush = () => store.getState().keepTabs();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [store]);

  const shown = active && tab !== undefined;
  useBinding(
    viewerKeymap.refresh,
    () => {
      if (tab !== undefined) {
        post({ type: 'refresh', tab });
      }
    },
    shown,
  );
  useBinding(
    viewerKeymap.closeViewer,
    () => {
      if (tab !== undefined) {
        closeTab(tab);
      }
    },
    shown,
  );

  if (!active) {
    return null;
  }
  return (
    <ViewerStore value={store}>
      <div className="repository">
        <div className="columns bars-outside viewer-columns">
          {tab === undefined ? (
            <section className="column viewer" />
          ) : (
            <Viewer key={tab} />
          )}
        </div>
      </div>
    </ViewerStore>
  );
}
