import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import './style.css';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { EditorToHost, EditorToWebview } from '../shared/protocol';
import { Editor } from './editor';
import { createEditorStore, EditorStore } from './store';

export function EditorTool({
  active,
  post,
  listen,
  views = noViews,
}: {
  active: boolean;
  post: (message: EditorToHost) => void;
  listen: (handler: (message: EditorToWebview) => void) => () => void;
  views?: ToolViews;
}) {
  const [store] = useState(() => createEditorStore(post, {}, views));
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
    <EditorStore value={store}>
      <div className="repository">
        <div className="columns single viewer-columns">
          {tab === undefined ? (
            <section className="column viewer editor" />
          ) : (
            <Editor key={tab} />
          )}
        </div>
      </div>
    </EditorStore>
  );
}
