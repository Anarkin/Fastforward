import { useCallback, useEffect, useMemo } from 'react';
import { useStore, type StoreApi } from 'zustand';
import type { ScrollSettings } from '../../../lib/page/scrollSettings';
import { Diff, type DiffProps } from './column';
import { DiffLanguage } from './language';
import {
  diffFindOf,
  drawnPlaceFor,
  pickedFor,
  type DiffActions,
  type DiffSource,
  type PlaceChange,
} from './slice';
import { DiffToggles } from './toggles';
import type { WholePaths } from './look';

export type DiffStore = StoreApi<DiffSource & DiffActions>;

export interface DiffTextView {
  readonly wordWrap: boolean;
  readonly showWhitespace: boolean;
  readonly highlightSyntax: boolean;
  readonly highlightOccurrences: boolean;
  readonly diffCells?: boolean;
  readonly scrolling: ScrollSettings;
  readonly changeTextView: (
    change: Partial<{
      readonly wordWrap: boolean;
      readonly showWhitespace: boolean;
      readonly highlightSyntax: boolean;
    }>,
  ) => void;
}

export function SlicedOptions({
  store,
  textView,
  languageKey,
  shown,
}: {
  readonly store: DiffStore;
  readonly textView: DiffTextView;
  readonly languageKey: string | undefined;
  readonly shown: string | undefined;
}) {
  const entire = useStore(store, (state) => state.showEntireFile);
  const ignoreWhitespace = useStore(store, (state) => state.ignoreWhitespace);
  const layout = useStore(store, (state) => state.diffLayout);
  const picked = useStore(store, pickedFor(languageKey));
  const changeShowEntireFile = useStore(
    store,
    (state) => state.changeShowEntireFile,
  );
  const changeIgnoreWhitespace = useStore(
    store,
    (state) => state.changeIgnoreWhitespace,
  );
  const changeDiffLayout = useStore(store, (state) => state.changeDiffLayout);
  const pickLanguage = useStore(store, (state) => state.pickLanguage);
  const seeLanguageKey = useStore(store, (state) => state.seeLanguageKey);
  useEffect(() => seeLanguageKey(languageKey), [languageKey, seeLanguageKey]);
  const { wordWrap, showWhitespace, highlightSyntax, scrolling } = textView;
  const { changeTextView } = textView;
  return (
    <DiffToggles
      language={
        <DiffLanguage
          languageKey={languageKey}
          shown={shown}
          picked={picked}
          onPick={(language) => pickLanguage(languageKey, language)}
          highlightSyntax={highlightSyntax}
          onHighlightSyntax={(on) => changeTextView({ highlightSyntax: on })}
          scrolling={scrolling}
        />
      }
      entire={entire}
      ignoreWhitespace={ignoreWhitespace}
      layout={layout}
      wordWrap={wordWrap}
      showWhitespace={showWhitespace}
      onEntire={changeShowEntireFile}
      onIgnoreWhitespace={changeIgnoreWhitespace}
      onLayout={changeDiffLayout}
      onWordWrap={(wrap) => changeTextView({ wordWrap: wrap })}
      onShowWhitespace={(show) => changeTextView({ showWhitespace: show })}
    />
  );
}

export function SlicedDiff({
  store,
  textView,
  languageKey,
  root,
  wholePaths,
  note,
  ...shown
}: Omit<DiffProps, 'look' | 'measures' | 'measuring' | 'tab' | 'options'> & {
  readonly store: DiffStore;
  readonly textView: DiffTextView;
  readonly languageKey: string | undefined;
  readonly root: string | undefined;
  readonly wholePaths?: WholePaths;
  readonly note?: string;
}) {
  const { scope, selection } = shown;
  const sideBySide = useStore(
    store,
    (state) => state.diffLayout === 'sideBySide',
  );
  const language = useStore(store, pickedFor(languageKey));
  const measures = useStore(store, (state) => state.diffMeasures);
  const find = useStore(store, diffFindOf(scope));
  const measureDiffText = useStore(store, (state) => state.measureDiffText);
  const snapDiffCode = useStore(store, (state) => state.snapDiffCode);
  const keepWrapColumns = useStore(store, (state) => state.keepWrapColumns);
  const keepDiffFind = useStore(store, (state) => state.keepDiffFind);
  const closeDiffFind = useStore(store, (state) => state.closeDiffFind);
  const drawnPlace = useMemo(
    () => drawnPlaceFor(scope, selection),
    [scope, selection],
  );
  const place = useStore(store, drawnPlace);
  const diffPlaceOf = useStore(store, (state) => state.diffPlaceOf);
  const placeNow = useCallback(
    () => diffPlaceOf(scope, selection),
    [diffPlaceOf, scope, selection],
  );
  const keepDiffPlace = useStore(store, (state) => state.keepDiffPlace);
  const keepPlace = useCallback(
    (change: PlaceChange) => keepDiffPlace(scope, selection, change),
    [keepDiffPlace, scope, selection],
  );
  const {
    wordWrap,
    showWhitespace,
    highlightSyntax,
    highlightOccurrences,
    diffCells,
    scrolling,
  } = textView;
  return (
    <Diff
      {...shown}
      options={
        <SlicedOptions
          store={store}
          textView={textView}
          languageKey={languageKey}
          shown={shown.path}
        />
      }
      look={{
        sideBySide,
        wordWrap,
        showWhitespace,
        highlightSyntax,
        highlightOccurrences,
        cells: diffCells === true,
        scrolling,
        root,
        language,
        ...(wholePaths && { wholePaths }),
        ...(note !== undefined && { note }),
      }}
      measures={measures}
      measuring={{
        measureText: measureDiffText,
        snapCode: snapDiffCode,
        keepWrapColumns,
      }}
      tab={{
        find,
        keepFind: (next) => keepDiffFind(scope, next),
        closeFind: () => closeDiffFind(scope),
        place,
        placeNow,
        keepPlace,
      }}
    />
  );
}
