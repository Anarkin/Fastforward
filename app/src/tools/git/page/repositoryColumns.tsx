import { memo, useMemo, useState } from 'react';
import { useShell } from '../../../shell/page/store';
import { useBinding } from '../../../ui/shortcuts';
import { gitKeymap } from './keymap';
import { Diff, DiffLanguage, DiffOptions, diffSelection } from './diffColumn';
import { Commits } from './commitList';
import { Files } from './filesColumn';
import {
  fileFilterOf,
  languageKeyOf,
  openingOf,
  useGit,
  useGitActions,
} from './store';
import { usePrefetchedColors } from './syntax';
import { changesShown } from './tabView';

export const CommitColumn = memo(Commits);

export const FileColumn = memo(Files);

export const RepositoryDiff = memo(function RepositoryDiff() {
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
  const findsHere = useGit((state) => state.activeColumn === 'diff');
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
