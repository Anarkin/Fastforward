import { compareKeymap, gitKeymap } from './keymap';
import { CompareView } from './compareView';
import {
  comparingOf,
  useShell,
  useShellActions,
} from '../../../shell/page/store';
import './style.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type GitToHost, type GitToWebview } from '../shared/protocol';
import {
  createGitStore,
  GitStore,
  layoutSelectionOf,
  openingOf,
  useGit,
  useGitActions,
  type GitState,
} from './store';
import { columnsClass, showsDiff, templateOf } from './columns';
import {
  columnOf,
  columnOrder,
  columnStep,
  forwardedColumn,
  keyboardAmongColumns,
  keyboardDropped,
  shownColumns,
  type ColumnName,
} from './activeColumn';
import { columnFocusAttribute } from '../../../lib/page/columnFocus';
import { clicked } from '../../../lib/shared/keymap';
import { useBinding } from '../../../lib/page/shortcuts';
import { startColorer } from '../../../lib/page/syntax';
import { listsNothing } from './filesColumnState';
import { strings } from '../../../lib/shared/strings';
import { WorktreeBar } from './worktreeBar';
import { treeOf, treeToLoad } from './tabView';
import { repositoryMenuItems } from './repositoryMenu';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { ClonePopup } from './clonePopup';
import { CommitColumn, FileColumn, RepositoryDiff } from './repositoryColumns';
import { AddressBar, NavButtons } from './navBar';

export interface GitToolProps {
  active: boolean;
  post: (message: GitToHost) => void;
  listen: (handler: (message: GitToWebview) => void) => () => void;
}

function diffShownOf(state: GitState): boolean {
  const { tab, showAllFiles } = state;
  return showsDiff(
    tab.error,
    listsNothing({
      files: tab.files,
      staged: tab.staged,
      allPaths: showAllFiles ? treeOf(tab) : undefined,
      loading: tab.filesLoading || openingOf(state),
    }),
  );
}

const commitNavigation = <NavButtons />;
const commitSearch = <AddressBar />;

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

function GitTitleAndMenus({ comparing }: { comparing: string | undefined }) {
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
  useEffect(
    () => setToolTitle('git', comparing === undefined ? activeTab : undefined),
    [activeTab, comparing, setToolTitle],
  );
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

function RepositoryColumns() {
  const columnWidths = useGit((state) => state.columnWidths);
  const commitsShown = useGit((state) => state.commitsShown);
  const searching = useGit((state) => state.searching);
  const activeColumn = useGit((state) => state.activeColumn);
  const layoutSelection = useGit(layoutSelectionOf);
  const diffShown = useGit(diffShownOf);
  const { activateColumn } = useGitActions();
  const commitColumnShown = commitsShown || searching;
  const columnsContainer = useRef<HTMLDivElement>(null);
  const columnsTemplate = templateOf(columnWidths, [!commitColumnShown, false]);
  const focusColumn = useCallback(
    (column: ColumnName) => {
      const target = columnsContainer.current?.children[
        columnOrder.indexOf(column)
      ]?.querySelector<HTMLElement>(`[${columnFocusAttribute}]`);
      target?.focus();
      return target;
    },
    [columnsContainer],
  );
  useEffect(() => {
    const onFocusOut = ({ target }: FocusEvent) => {
      if (
        target instanceof Element &&
        columnsContainer.current?.contains(target)
      ) {
        queueMicrotask(() => {
          if (keyboardDropped(target, document.activeElement, document.body)) {
            focusColumn(activeColumn);
          }
        });
      }
    };
    document.addEventListener('focusout', onFocusOut);
    return () => document.removeEventListener('focusout', onFocusOut);
  }, [columnsContainer, focusColumn, activeColumn]);
  const activeShown = shownColumns(
    commitColumnShown,
    layoutSelection,
    diffShown,
  ).includes(activeColumn);
  useEffect(() => {
    if (!activeShown) {
      const [first] = shownColumns(
        commitColumnShown,
        layoutSelection,
        diffShown,
      );
      if (
        first &&
        keyboardAmongColumns(
          document.activeElement,
          columnsContainer.current,
          document.body,
        )
      ) {
        focusColumn(first);
      }
    }
  }, [activeShown, commitColumnShown, layoutSelection, diffShown, focusColumn]);
  return (
    <div
      className={columnsClass(commitColumnShown, layoutSelection, diffShown)}
      ref={columnsContainer}
      style={{ gridTemplateColumns: columnsTemplate }}
      data-active-column={activeColumn}
      onFocus={(event) => {
        const column = columnOf(
          event.target instanceof Element ? event.target : null,
        );
        if (column) {
          activateColumn(column);
        }
      }}
      onKeyDown={(event) => {
        const target =
          event.target instanceof HTMLElement ? event.target : null;
        const forwarded = forwardedColumn(columnOf(target), event);
        if (forwarded) {
          event.preventDefault();
          focusColumn(forwarded)?.dispatchEvent(
            new KeyboardEvent('keydown', event.nativeEvent),
          );
          return;
        }
        const step = columnStep(
          event,
          shownColumns(commitColumnShown, layoutSelection, diffShown),
          columnOf(target) ?? activeColumn,
          target?.hasAttribute(columnFocusAttribute) ?? true,
        );
        if (step?.preventDefault) {
          event.preventDefault();
        }
        if (step?.next) {
          focusColumn(step.next);
        }
      }}
    >
      <CommitColumn navigation={commitNavigation} search={commitSearch} />
      <FileColumn />
      <RepositoryDiff />
    </div>
  );
}

export function GitTool({ active, post: postToHost, listen }: GitToolProps) {
  const comparing = useShell(comparingOf);
  const { closeTab: onClose, toggleTextView } = useShellActions();
  const [store] = useState(() => createGitStore(postToHost));
  const { navigate, jump, showUpstream, showParent, toggleCommits } =
    store.getState();
  useEffect(() => listen(store.getState().receive), [listen, store]);
  useEffect(() => {
    if (active) {
      startColorer();
    }
  }, [active]);
  const repositoryShown = active && comparing === undefined;
  useBinding(
    compareKeymap.closeCompare,
    () => {
      if (comparing !== undefined) {
        onClose(comparing);
      }
    },
    active && comparing !== undefined,
  );
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
      <GitTitleAndMenus comparing={comparing} />
      {!active ? null : comparing !== undefined ? (
        <CompareView comparing={comparing} />
      ) : (
        <div className="repository">
          <WorktreeBar />
          <RepositoryColumns />
        </div>
      )}
    </GitStore>
  );
}
