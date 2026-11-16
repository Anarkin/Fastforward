import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import './style.css';
import { startColorer } from '../../../lib/page/syntax';
import { useBinding } from '../../../lib/page/shortcuts';
import { diffKeymap } from '../../../components/diff/page/diffKeymap';
import { useShellActions } from '../../../shell/page/store';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { DiffToHost, DiffToWebview } from '../shared/protocol';
import { compareKeymap } from './compareKeymap';
import { CompareView } from './compareView';
import { createDiffStore, DiffStore } from './store';

export function DiffTool({
  active,
  post,
  listen,
  views = noViews,
}: {
  active: boolean;
  post: (message: DiffToHost) => void;
  listen: (handler: (message: DiffToWebview) => void) => () => void;
  views?: ToolViews;
}) {
  const [store] = useState(() => createDiffStore(post, {}, views));
  const tab = useStore(store, (state) => state.tab);
  const { closeTab, toggleTextView } = useShellActions();

  useEffect(() => listen(store.getState().receive), [listen, store]);
  useEffect(() => views.onRelease(store.getState().releaseTab), [views, store]);
  useEffect(() => {
    const flush = () => store.getState().keepTabs();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [store]);
  useEffect(() => {
    if (active) {
      startColorer();
    }
  }, [active]);

  const shown = active && tab !== undefined;
  useBinding(
    compareKeymap.closeCompare,
    () => {
      if (tab !== undefined) {
        closeTab(tab);
      }
    },
    shown,
  );
  useBinding(diffKeymap.wrap, () => toggleTextView('wordWrap'), shown);
  useBinding(
    diffKeymap.showWhitespace,
    () => toggleTextView('showWhitespace'),
    shown,
  );

  if (!shown) {
    return null;
  }
  return (
    <DiffStore value={store}>
      <CompareView key={tab} tab={tab} />
    </DiffStore>
  );
}
