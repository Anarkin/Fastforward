import { compareKeymap, gitKeymap } from '../shared/keymap';
import { CompareView } from './compareView';
import { useShell, useShellActions } from '../../../shell/page/store';
import './style.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { type GitToHost, type GitToWebview } from '../shared/protocol';
import {
  createGitStore,
  GitStore,
  layoutSelectionOf,
  openingOf,
  type GitState,
} from './store';
import { columnsClass, showsDiff, templateOf } from './columns';
import {
  columnOf,
  columnOrder,
  columnStep,
  forwardedColumn,
  keyboardDropped,
  shownColumns,
  type ColumnName,
} from './activeColumn';
import { columnFocusAttribute } from '../../../ui/columnFocus';
import { clicked } from '../../../shell/shared/keymap';
import { useBinding } from '../../../ui/shortcuts';
import { listsNothing } from './filesColumn';
import { strings } from '../../../shared/strings';
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
  comparing: string | undefined;
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

export function GitTool({
  active,
  post: postToHost,
  listen,
  comparing,
}: GitToolProps) {
  const {
    closeMenu,
    setToolItems,
    setToolTitle,
    closeTab: onClose,
    changeTextView,
  } = useShellActions();
  const [store] = useState(() => createGitStore(postToHost));
  const {
    navigate,
    jump,
    showUpstream,
    showParent,
    requestTree,
    openRepository,
    browseRepositories,
    openClone,
    initRepository,
    checkCloneTarget,
    chooseCloneFolder,
    startClone,
    stopClone,
    forgetRecent,
    answerInit,
    closeClone,
    toggleCommits,
    activateColumn,
  } = store.getState();
  const activeTab = useStore(store, (state) => state.tab.root);
  const recent = useStore(store, (state) => state.recent);
  const initAsked = useStore(store, (state) => state.initAsked);
  const clone = useStore(store, (state) => state.clone);
  const columnWidths = useStore(store, (state) => state.columnWidths);
  const commitsShown = useStore(store, (state) => state.commitsShown);
  const searching = useStore(store, (state) => state.searching);
  const activeColumn = useStore(store, (state) => state.activeColumn);
  const layoutSelection = useStore(store, layoutSelectionOf);
  const diffShown = useStore(store, diffShownOf);
  const treeNeeded = useStore(store, (state) =>
    state.showAllFiles ? treeToLoad(state.tab) : undefined,
  );
  useEffect(() => listen(store.getState().receive), [listen, store]);
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
  const textView = useShell((state) => state.textView);
  const { wordWrap, showWhitespace } = textView;
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
  useBinding(gitKeymap.commits, toggleCommits, repositoryShown);
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
      if (first) {
        focusColumn(first);
      }
    }
  }, [activeShown, commitColumnShown, layoutSelection, diffShown, focusColumn]);

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

  useEffect(() => {
    if (treeNeeded) {
      requestTree(treeNeeded);
    }
  }, [treeNeeded, requestTree]);

  useBinding(
    gitKeymap.wrap,
    () => changeTextView({ ...textView, wordWrap: !wordWrap }),
    active,
  );
  useBinding(
    gitKeymap.showWhitespace,
    () => changeTextView({ ...textView, showWhitespace: !showWhitespace }),
    active,
  );
  const popups = (
    <>
      {clone.view && (
        <ClonePopup
          view={clone.view}
          formKey={clone.form}
          chosenFolder={clone.folder}
          checked={clone.target}
          onCheck={checkCloneTarget}
          onChooseFolder={chooseCloneFolder}
          onClone={startClone}
          onStop={stopClone}
          onClose={closeClone}
        />
      )}
      {initAsked && (
        <ConfirmPopup
          title={strings.confirm.initTitle}
          message={strings.confirm.initInside(
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

  if (!active) {
    return popups;
  }

  return (
    <>
      {popups}
      <GitStore value={store}>
        {comparing !== undefined ? (
          <CompareView comparing={comparing} />
        ) : (
          <div className="repository">
            <WorktreeBar />
            <div
              className={columnsClass(
                commitColumnShown,
                layoutSelection,
                diffShown,
              )}
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
              <CommitColumn
                navigation={commitNavigation}
                search={commitSearch}
              />
              <FileColumn />
              <RepositoryDiff />
            </div>
          </div>
        )}
      </GitStore>
    </>
  );
}
