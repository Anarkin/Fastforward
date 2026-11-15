import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShell } from '../../../shell/page/store';
import { useBinding } from '../../../lib/page/shortcuts';
import { columnFocusAttribute } from '../../../lib/page/columnFocus';
import { gitKeymap } from './keymap';
import { diffSelection } from './diffSelection';
import { Diff } from './diffColumn';
import { DiffLanguage, DiffOptions } from './diffOptions';
import { Commits } from './commitList';
import { Files } from './filesColumn';
import {
  activeColumnOf,
  commitsShownOf,
  tabScopeOf,
  diffShownOf,
  fileFilterOf,
  languageKeyOf,
  layoutSelectionOf,
  openingOf,
  searchingOf,
} from './gitSelectors';
import { useGit, useGitActions } from './store';
import { usePrefetchedColors } from './syntax';
import { changesShown } from './tabView';
import { templateOf } from './columns';
import { columnsClass } from './columnsShown';
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
import { NavButtons } from './navBar';
import { AddressBar } from './addressBar';
import { focusBack, type KeptFocus } from '../../../lib/page/keptFocus';
import { useTabFocus } from './tabFocus';

const CommitColumn = memo(Commits);

const FileColumn = memo(Files);

const RepositoryDiff = memo(function RepositoryDiff() {
  const root = useGit((state) => state.tab.root);
  const hash = useGit((state) => state.tab.hash);
  const path = useGit((state) => state.tab.path);
  const area = useGit((state) => state.tab.area);
  const loading = useGit((state) => state.tab.patchLoading || openingOf(state));
  const largeFiles = useGit((state) => state.tab.largeFiles);
  const texts = useGit((state) => state.tab.texts);
  const files = useGit((state) => changesShown(state.tab));
  const patch = useGit((state) => state.tab.patch);
  const leftOut = useGit((state) => state.tab.leftOut);
  const whitespaceOnly = useGit((state) => state.tab.whitespaceOnly);
  const diffs = useGit((state) => state.tab.diffs);
  const refreshes = useGit((state) => state.tab.refreshes);
  const fileContent = useGit((state) => state.tab.fileContent);
  const error = useGit((state) => state.tab.error);
  const filter = useGit(fileFilterOf);
  const languageKey = useGit((state) => languageKeyOf(undefined, state.tab));
  const entire = useGit((state) => state.showEntireFile);
  const findsHere = useGit((state) => activeColumnOf(state) === 'diff');
  const prefetchedPatch = useGit((state) => state.tab.prefetched?.patch);
  const prefetchedTexts = useGit((state) => state.tab.prefetched?.texts);
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  usePrefetchedColors(prefetchedPatch, prefetchedTexts, highlightSyntax);
  const { loadFileDiff, loadTexts, viewFile } = useGitActions();
  const [findAsked, setFindAsked] = useState(0);
  const [viewAsked, setViewAsked] = useState(0);
  useBinding(
    gitKeymap.find,
    () => setFindAsked((count) => count + 1),
    findsHere,
  );
  useBinding(gitKeymap.viewFile, () => setViewAsked((count) => count + 1));
  const origin = useMemo(
    () =>
      root === undefined || hash === undefined
        ? undefined
        : {
            root,
            hash,
            ...(area === undefined ? {} : { area }),
            version: `${diffs}.${refreshes}`,
          },
    [root, hash, area, diffs, refreshes],
  );
  return (
    <Diff
      scope={tabScopeOf(undefined, root)}
      selection={diffSelection(root, hash, path, area)}
      path={path}
      loading={loading}
      largeFiles={largeFiles}
      onLoadFile={loadFileDiff}
      texts={texts}
      onLoadTexts={loadTexts}
      onViewFile={viewFile}
      viewAsked={viewAsked}
      files={files}
      patch={patch}
      leftOut={leftOut}
      whitespaceOnly={whitespaceOnly}
      diffs={diffs}
      fileContent={fileContent}
      error={error}
      origin={origin}
      findAsked={findAsked}
      filter={filter}
      languageKey={languageKey}
      changeMarks={path !== undefined && entire}
      entire={entire}
      options={
        <DiffOptions language={<DiffLanguage comparing={undefined} />} />
      }
    />
  );
});

const commitNavigation = <NavButtons />;
const commitSearch = <AddressBar />;

export function RepositoryColumns() {
  const columnWidths = useGit((state) => state.columnWidths);
  const commitsShown = useGit(commitsShownOf);
  const searching = useGit(searchingOf);
  const activeColumn = useGit(activeColumnOf);
  const layoutSelection = useGit(layoutSelectionOf);
  const diffShown = useGit(diffShownOf);
  const root = useGit((state) => state.tab.root);
  useGit((state) => state.tab.diffs);
  useGit((state) => state.tab.path);
  useGit((state) => state.tab.history !== undefined);
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
  const shown = shownColumns(commitColumnShown, layoutSelection, diffShown);
  const activeShown = shown.includes(activeColumn);
  const focusPart = (kept: KeptFocus) => {
    const container = columnsContainer.current;
    const column = columnOrder.find((name) => name === kept.name);
    if (column === undefined) {
      return container !== null && focusBack(container, kept);
    }
    const target = shown.includes(column) ? focusColumn(column) : undefined;
    return target !== undefined && target === document.activeElement;
  };
  const pendingFocus = useTabFocus({
    container: columnsContainer,
    scope: root === undefined ? undefined : tabScopeOf(undefined, root),
    focusPart,
    fallback: () => {
      const [first] = shown;
      if (
        keyboardAmongColumns(
          document.activeElement,
          columnsContainer.current,
          document.body,
        )
      ) {
        focusColumn(activeShown ? activeColumn : first);
      }
    },
  });
  useEffect(() => {
    if (!activeShown && pendingFocus.current === undefined) {
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
  }, [
    activeShown,
    commitColumnShown,
    layoutSelection,
    diffShown,
    focusColumn,
    pendingFocus,
  ]);
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
