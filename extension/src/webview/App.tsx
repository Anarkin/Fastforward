import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  workingTreeHash,
  type ChangesView,
  type CheckoutTarget,
  type FilesMode,
  type RefInfo,
  type TabInfo,
  type ToExtension,
  type ToWebview,
  type Vip,
} from '../protocol';
import { CheckedOutBranch, DetachedHead, BubbleBar } from './bubbles';
import { checkoutOptions, checkoutRef } from './checkout';
import { ColumnResizingProvider, useColumnWidths } from './columns';
import { commitPageSize } from './commitHistory';
import { Commits } from './commitList';
import {
  ContextMenu,
  OpenContextMenu,
  type ContextMenuItem,
  type MenuTarget,
  type OpenMenu,
} from './contextMenu';
import { Diff } from './diffColumn';
import { Files } from './filesColumn';
import { foldersOf } from './fileTree';
import { sameRef } from '../refNames';
import { TabBar } from './tabBar';
import { emptyTabView, reduceTabView } from './tabView';
import { vipOptions } from './vips';

interface Props {
  post: (message: ToExtension) => void;
}

export function App({ post }: Props) {
  const [tabs, setTabs] = useState<readonly TabInfo[]>([]);
  const [activeTab, setActiveTab] = useState<string>();
  const activeTabRef = useRef<string>(undefined);
  const [tab, dispatch] = useReducer(reduceTabView, emptyTabView);
  const {
    repository,
    history,
    scrollTarget,
    workingTree,
    hash,
    files,
    filesLoading,
    patchLoading,
    path,
    patch,
    fileContent,
    filePatches,
    tree,
    syncing,
    error,
  } = tab;
  // Sublime Merge's setting, on by default
  const [collapseMerges, setCollapseMerges] = useState(true);
  const [filesMode, setFilesMode] = useState<FilesMode>('changes');
  const [changesView, setChangesView] = useState<ChangesView>('list');
  // Closed folders of the Changes tree, which start open
  const [closedFolders, setClosedFolders] = useState<ReadonlySet<string>>(
    new Set(),
  );
  // Open folders of the Files view, kept while moving between commits
  const [openFolders, setOpenFolders] = useState<ReadonlySet<string>>(
    new Set(),
  );
  // Refs pinned to the VIP row, saved per repository
  const [vips, setVips] = useState<readonly Vip[]>([]);
  const [menu, setMenu] = useState<OpenMenu>();
  const closeMenu = useCallback(() => setMenu(undefined), []);
  const saveColumnWidths = useCallback(
    (widths: readonly number[]) => post({ type: 'setColumnWidths', widths }),
    [post],
  );
  const {
    container: columnsContainer,
    template: columnsTemplate,
    load: loadColumnWidths,
    resizing,
  } = useColumnWidths(saveColumnWidths);

  useEffect(() => {
    const onMessage = (event: MessageEvent<ToWebview>) => {
      const message = event.data;
      switch (message.type) {
        case 'layout':
          loadColumnWidths(message.columnWidths);
          setCollapseMerges(message.collapseMerges);
          setFilesMode(message.filesMode);
          setChangesView(message.changesView);
          break;
        case 'tabs':
          // Everything shown for the previous tab is forgotten
          if (activeTabRef.current !== message.active) {
            dispatch({ type: 'clear' });
          }
          activeTabRef.current = message.active;
          setTabs(message.tabs);
          setActiveTab(message.active);
          break;
        case 'vips':
          setVips(message.vips);
          break;
        default:
          dispatch(message);
      }
    };
    window.addEventListener('message', onMessage);
    post({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, [post, loadColumnWidths]);

  // Shows a commit as selected while its files and diff load
  const showCommit = (next: string | undefined) =>
    dispatch({ type: 'showCommit', hash: next });

  const log = useCallback(
    (message: string) => post({ type: 'log', level: 'info', message }),
    [post],
  );

  const onScrolled = useCallback(
    (top: string, offset: number) =>
      post({ type: 'scrolled', hash: top, offset }),
    [post],
  );

  const loadCommits = useCallback(
    (start: number) =>
      post({ type: 'loadCommits', start, count: commitPageSize }),
    [post],
  );

  const refsByCommit = useMemo(() => {
    const map = new Map<string, RefInfo[]>();
    for (const info of repository?.refs ?? []) {
      map.set(info.commit, [...(map.get(info.commit) ?? []), info]);
    }
    return map;
  }, [repository]);

  const commit = history?.find(hash);
  // A tab whose history hasn't arrived yet, which every column shows
  // placeholders for, as it selects what is checked out once it has
  const opening = activeTab !== undefined && history === undefined && !error;

  // Selecting the selected commit again, or "No changes", clears the selection
  const selectCommit = (next: string | undefined, index: number) => {
    const target = next === hash ? undefined : next;
    showCommit(target);
    post({
      type: 'selectCommit',
      hash: target,
      index: target === undefined ? undefined : index,
    });
  };
  // Scrolls to a location's commit, which the extension finds in the history
  const jump = (target: string | undefined) => {
    if (target) {
      post({ type: 'jump', hash: target });
    }
  };
  const loadFileDiff = useCallback(
    (file: string) => {
      if (hash) {
        post({ type: 'loadFileDiff', hash, path: file });
      }
    },
    [hash, post],
  );

  const selectFile = (next: string | undefined) => {
    if (!hash) {
      return;
    }
    dispatch({ type: 'showFile', path: next });
    post({ type: 'selectFile', hash, path: next });
  };

  // The Files view needs every file of the repository at the selected commit
  useEffect(() => {
    if (filesMode === 'files' && hash && tree?.hash !== hash) {
      post({ type: 'loadTree', hash });
    }
  }, [filesMode, hash, tree, post]);

  // The selected file's folders open, so it is visible in the Files view
  useEffect(() => {
    if (filesMode !== 'files' || path === undefined) {
      return;
    }
    const folders = foldersOf(path);
    setOpenFolders((open) =>
      folders.every((folder) => open.has(folder))
        ? open
        : new Set([...open, ...folders]),
    );
  }, [filesMode, path]);

  const toggleIn = (set: typeof setOpenFolders) => (folder: string) =>
    set((folders) => {
      const next = new Set(folders);
      if (!next.delete(folder)) {
        next.add(folder);
      }
      return next;
    });
  const toggleFolder = toggleIn(setOpenFolders);
  const toggleClosedFolder = toggleIn(setClosedFolders);

  const changeFilesMode = (mode: FilesMode) => {
    setFilesMode(mode);
    post({ type: 'setFilesMode', mode });
  };

  const changeChangesView = (view: ChangesView) => {
    setChangesView(view);
    post({ type: 'setChangesView', view });
  };

  const changeVips = (next: readonly Vip[]) => {
    setVips(next);
    post({ type: 'setVips', vips: next });
  };

  const isVip = (vip: Vip) => vips.some((other) => sameRef(other, vip));
  const toggleVip = (vip: Vip) =>
    changeVips(
      isVip(vip)
        ? vips.filter((other) => !sameRef(other, vip))
        : [...vips, vip],
    );
  const vipItem = (vip: Vip): ContextMenuItem => ({
    label: isVip(vip) ? 'Remove from VIP' : 'Add VIP',
    onClick: () => toggleVip(vip),
  });
  // A commit's refs and the commit itself, each checked when it is a VIP
  const commitVipItem = (commitHash: string): ContextMenuItem => ({
    label: 'VIP',
    submenu: vipOptions(commitHash, repository?.refs ?? []).map((option) => ({
      label: option.label,
      checked: isVip(option.vip),
      onClick: () => toggleVip(option.vip),
    })),
  });

  // The items of the menu for what was right-clicked
  const checkout = (target: CheckoutTarget) =>
    post({ type: 'checkout', target });

  const menuItems = (target: MenuTarget): ContextMenuItem[] => {
    const refs = repository?.refs ?? [];
    const head = repository?.head;
    if (target.kind === 'commit') {
      const detached = repository && !head ? repository.headCommit : undefined;
      return [
        {
          label: 'Checkout',
          submenu: checkoutOptions(target.hash, refs, head, detached).map(
            (option) => ({
              label: option.label,
              disabled: option.disabled,
              onClick: () => checkout(option.target),
            }),
          ),
        },
        { separator: true },
        commitVipItem(target.hash),
      ];
    }
    const { ref } = target;
    const detached = repository && !head ? repository.headCommit : undefined;
    const option =
      ref.kind === 'commit'
        ? {
            target: { kind: 'commit' as const, hash: ref.name },
            disabled: ref.name === detached,
          }
        : checkoutRef(ref, refs, head);
    return [
      {
        label: 'Checkout',
        disabled: option.disabled,
        onClick: () => checkout(option.target),
      },
      { separator: true },
      vipItem(target.ref),
    ];
  };

  const openMenu = (event: React.MouseEvent, target: MenuTarget) => {
    // Only the innermost target, like a bubble inside a commit row
    event.stopPropagation();
    const items = menuItems(target);
    if (items.length > 0) {
      event.preventDefault();
      setMenu({ x: event.clientX, y: event.clientY, items });
    }
  };

  return (
    <OpenContextMenu.Provider value={openMenu}>
      <CheckedOutBranch.Provider value={repository?.head}>
        <DetachedHead.Provider
          value={
            repository && !repository.head ? repository.headCommit : undefined
          }
        >
          <div className="app">
            <TabBar
              tabs={tabs}
              active={activeTab}
              onSelect={(root) => post({ type: 'selectTab', root })}
              onClose={(root) => post({ type: 'closeTab', root })}
              onAdd={() => post({ type: 'addTab' })}
              onSort={() => post({ type: 'sortTabs' })}
              onLog={log}
            />
            {tabs.length > 0 && (
              <BubbleBar
                root={activeTab}
                repository={repository}
                selected={hash}
                vips={vips}
                onJump={jump}
                syncing={syncing}
                onSync={(action) => post({ type: 'sync', action })}
              />
            )}
            {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
            {tabs.length === 0 ? (
              <div className="empty-state">
                No repository is open. Use + to open one.
              </div>
            ) : (
              <ColumnResizingProvider value={resizing}>
                <div
                  className="columns"
                  ref={columnsContainer}
                  style={{ gridTemplateColumns: columnsTemplate }}
                >
                  <Commits
                    history={history}
                    opening={opening}
                    scrollTarget={scrollTarget}
                    onScrolled={onScrolled}
                    onLoad={loadCommits}
                    workingTree={workingTree}
                    refsByCommit={refsByCommit}
                    selected={hash}
                    onSelect={selectCommit}
                    onToggleMerge={(merge) =>
                      post({ type: 'toggleMerge', hash: merge })
                    }
                    collapseMerges={collapseMerges}
                    onCollapseMerges={(collapse) => {
                      setCollapseMerges(collapse);
                      post({ type: 'setCollapseMerges', collapse });
                    }}
                  />
                  <Files
                    mode={filesMode}
                    onMode={changeFilesMode}
                    changesView={changesView}
                    onChangesView={changeChangesView}
                    closedFolders={closedFolders}
                    onToggleClosedFolder={toggleClosedFolder}
                    files={files}
                    loading={filesLoading || opening}
                    treeLoading={hash !== undefined && tree?.hash !== hash}
                    tree={
                      hash !== undefined && tree?.hash === hash
                        ? tree.paths
                        : undefined
                    }
                    openFolders={openFolders}
                    onToggleFolder={toggleFolder}
                    selected={path}
                    onSelect={selectFile}
                  />
                  <Diff
                    selection={`${hash ?? ''}:${path ?? ''}`}
                    path={path}
                    loading={patchLoading || opening}
                    filePatches={filePatches}
                    onLoadFile={loadFileDiff}
                    workingTree={hash === workingTreeHash}
                    commit={commit}
                    files={files}
                    patch={patch}
                    fileContent={
                      fileContent?.path === path ? fileContent : undefined
                    }
                    error={error}
                  />
                </div>
              </ColumnResizingProvider>
            )}
          </div>
        </DetachedHead.Provider>
      </CheckedOutBranch.Provider>
    </OpenContextMenu.Provider>
  );
}
