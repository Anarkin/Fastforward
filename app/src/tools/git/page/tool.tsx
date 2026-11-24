import { gitKeymap } from './keymap';
import { useShellActions } from '../../../shell/page/store';
import './style.css';
import { useEffect, useRef, useState } from 'react';
import { type GitToHost, type GitToWebview } from '../shared/protocol';
import { createGitStore, GitStore, useGit, useGitActions } from './store';
import { clicked } from '../../../lib/shared/keymap';
import { useBinding } from '../../../lib/page/shortcuts';
import { startColorer } from '../../../components/syntax/page/colorer';
import { strings } from '../../../lib/shared/strings';
import { WorktreeBar } from './worktreeBar';
import { treeToLoad } from './shownTab';
import { repositoryMenuItems } from './repositoryMenu';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { ClonePopup } from './clonePopup';
import { RepositoryColumns } from './repositoryColumns';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';

export interface GitToolProps {
  active: boolean;
  post: (message: GitToHost) => void;
  listen: (handler: (message: GitToWebview) => void) => () => void;
  views?: ToolViews;
}

function GitPopups() {
  const initAsked = useGit((state) => state.initAsked);
  const cloneShown = useGit((state) => state.clone.view !== undefined);
  const { answerInit } = useGitActions();
  return (
    <>
      {cloneShown && <ClonePopup />}
      {initAsked && (
        <ConfirmPopup
          title={strings.confirm.initTitle}
          message={strings.confirm.initInside}
          lines={strings.confirm.initInsideLines(
            initAsked.folder,
            initAsked.repository,
          )}
          confirm={strings.confirm.init}
          onConfirm={() => answerInit(true)}
          onCancel={() => answerInit(false)}
        />
      )}
    </>
  );
}

function GitTitleAndMenus() {
  const activeTab = useGit((state) => state.tab.root);
  const recent = useGit((state) => state.recent);
  const treeNeeded = useGit((state) =>
    state.showAllFiles ? treeToLoad(state.tab) : undefined,
  );
  const { closeMenu, setToolItems, setToolTitle } = useShellActions();
  const {
    openRepository,
    browseRepositories,
    openClone,
    initRepository,
    forgetRecent,
    requestTree,
  } = useGitActions();
  useEffect(
    () =>
      setToolItems(
        'git',
        repositoryMenuItems(recent, {
          onOpen: openRepository,
          onBrowse: browseRepositories,
          onClone: openClone,
          onInit: initRepository,
          onRemove: forgetRecent,
        }),
      ),
    [
      recent,
      setToolItems,
      forgetRecent,
      openRepository,
      browseRepositories,
      openClone,
      initRepository,
    ],
  );
  useEffect(() => setToolTitle('git', activeTab), [activeTab, setToolTitle]);
  const menuWorktree = useRef(activeTab);
  useEffect(() => {
    if (menuWorktree.current !== activeTab) {
      menuWorktree.current = activeTab;
      closeMenu();
    }
  }, [activeTab, closeMenu]);
  useEffect(() => {
    if (treeNeeded) {
      requestTree(treeNeeded);
    }
  }, [treeNeeded, requestTree]);
  return null;
}

export function GitTool({
  active,
  post: postToHost,
  listen,
  views = noViews,
}: GitToolProps) {
  const { toggleTextView } = useShellActions();
  const [store] = useState(() => createGitStore(postToHost, {}, views));
  const { navigate, jump, showUpstream, showParent, toggleCommits, refresh } =
    store.getState();
  useEffect(() => listen(store.getState().receive), [listen, store]);
  useEffect(() => views.onRelease(store.getState().releaseTab), [views, store]);
  useEffect(() => {
    const { flushKept } = store.getState();
    window.addEventListener('pagehide', flushKept);
    return () => window.removeEventListener('pagehide', flushKept);
  }, [store]);
  useEffect(() => {
    if (active) {
      startColorer();
    }
  }, [active]);
  const repositoryShown = active;
  useBinding(gitKeymap.commits, toggleCommits, repositoryShown);
  useEffect(() => {
    if (!repositoryShown) {
      return undefined;
    }
    const onMouseUp = (event: MouseEvent) => {
      const direction = clicked(gitKeymap.navigate, event);
      if (direction) {
        event.preventDefault();
        navigate(direction, 1);
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [repositoryShown, navigate]);
  useBinding(
    gitKeymap.navigate,
    (direction) => navigate(direction, 1),
    repositoryShown,
  );
  useBinding(
    gitKeymap.head,
    () => jump(store.getState().tab.repository?.headCommit),
    repositoryShown,
  );
  useBinding(gitKeymap.upstream, showUpstream, repositoryShown);
  useBinding(gitKeymap.refresh, refresh, repositoryShown);
  useBinding(gitKeymap.parent, showParent, repositoryShown);
  useBinding(gitKeymap.wrap, () => toggleTextView('wordWrap'), active);
  useBinding(
    gitKeymap.showWhitespace,
    () => toggleTextView('showWhitespace'),
    active,
  );

  return (
    <GitStore value={store}>
      <GitPopups />
      <GitTitleAndMenus />
      {!active ? null : (
        <div className="repository">
          <WorktreeBar />
          <RepositoryColumns />
        </div>
      )}
    </GitStore>
  );
}
