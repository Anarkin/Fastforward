import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBinding } from '../../../lib/page/shortcuts';
import { diffKeymap } from '../../../lib/page/diffKeymap';
import type { FileChange, LeftOut } from '../../../lib/shared/changes';
import { strings } from '../../../lib/shared/strings';
import type { DiffFile } from '../../../lib/page/diff';
import type { DiffPlace } from '../../../lib/page/diffPlace';
import type { KeptFind } from '../../../lib/page/diffFind';
import type { LoadedText } from '../../../lib/page/sideTexts';
import { Diff } from '../../../lib/page/diffColumn';
import { DiffLanguage } from '../../../lib/page/diffLanguage';
import { DiffToggles } from '../../../lib/page/diffToggles';
import {
  focusBack,
  useFocusKeeper,
  type KeptFocus,
} from '../../../lib/page/keptFocus';
import { useRestore } from '../../../lib/page/restore';
import { columnFocusAttribute } from '../../../lib/page/columnFocus';
import { plainSearch } from '../../../lib/shared/searchOptions';
import { useShell, useShellActions } from '../../../shell/page/store';
import type { CompareView as Compared } from '../shared/protocol';
import { comparedImageRoute } from '../shared/images';
import { useDiff, useDiffActions } from './store';

const noFiles: readonly FileChange[] = [];
const noLeftOut: readonly LeftOut[] = [];
const noPaths: readonly string[] = [];
const noLargeFiles: ReadonlyMap<string, DiffFile> = new Map();
const ignored = () => undefined;
const closedFind: KeptFind = {
  finding: false,
  search: { query: '', options: plainSearch },
};
const noTexts: ReadonlyMap<string, LoadedText> = new Map();

function noteOf(compare: Compared | undefined): string | undefined {
  if (compare?.same === 'identical') {
    return strings.diff.filesIdentical;
  }
  return compare?.same === 'whitespace'
    ? strings.diff.filesDifferInWhitespace
    : undefined;
}

function CompareOptions({ tab }: { tab: string }) {
  const entire = useDiff((state) => state.settings.showEntireFile);
  const ignoreWhitespace = useDiff((state) => state.settings.ignoreWhitespace);
  const layout = useDiff((state) => state.settings.diffLayout);
  const shown = useDiff((state) => state.compare?.new);
  const picked = useDiff((state) => state.languages.get(tab));
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const scrolling = useShell((state) => state.scrolling);
  const { changeTextView } = useShellActions();
  const {
    setShowEntireFile,
    setIgnoreWhitespace,
    setDiffLayout,
    pickLanguage,
  } = useDiffActions();
  return (
    <DiffToggles
      language={
        <DiffLanguage
          languageKey={tab}
          shown={shown}
          picked={picked}
          onPick={(language) => pickLanguage(tab, language)}
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
      onEntire={setShowEntireFile}
      onIgnoreWhitespace={setIgnoreWhitespace}
      onLayout={setDiffLayout}
      onWordWrap={(wrap) => changeTextView({ wordWrap: wrap })}
      onShowWhitespace={(show) => changeTextView({ showWhitespace: show })}
    />
  );
}

export function CompareView({ tab }: { tab: string }) {
  const [findAsked, setFindAsked] = useState(0);
  useBinding(diffKeymap.find, () => setFindAsked((count) => count + 1));
  const compare = useDiff((state) =>
    state.compare?.tab === tab ? state.compare : undefined,
  );
  const texts = useDiff((state) =>
    state.compare?.tab === tab ? state.texts : noTexts,
  );
  const sideBySide = useDiff(
    (state) => state.settings.diffLayout === 'sideBySide',
  );
  const language = useDiff((state) => state.languages.get(tab));
  const measures = useDiff((state) => state.measures);
  const find = useDiff((state) => state.finds.get(tab) ?? closedFind);
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const scrolling = useShell((state) => state.scrolling);
  const {
    loadTexts,
    measureText,
    snapCode,
    keepWrapColumns,
    keepFind,
    closeFind,
    placeOf,
    keepPlace,
    focusOf,
    keepFocus,
  } = useDiffActions();
  const keepTabPlace = useCallback(
    (change: Partial<DiffPlace>) => keepPlace(tab, change),
    [keepPlace, tab],
  );
  const view = useRef<HTMLDivElement>(null);
  const shownTab = compare?.tab;
  const restoring = useRestore(
    shownTab === undefined ? undefined : focusOf(shownTab),
    () => view.current !== null,
    (kept: KeptFocus) => {
      const container = view.current;
      if (container === null) {
        return false;
      }
      if (kept.name !== 'diff') {
        return focusBack(container, kept);
      }
      const list = container.querySelector<HTMLElement>(
        `[${columnFocusAttribute}]`,
      );
      list?.focus({ preventScroll: true });
      return list !== null && list === document.activeElement;
    },
    { key: shownTab, watch: view },
  );
  useFocusKeeper(view, (focus) => {
    const element = view.current;
    if (
      restoring.current === undefined &&
      element?.contains(element.ownerDocument.activeElement)
    ) {
      keepFocus(tab, focus);
    }
  });
  const origin = useMemo(
    () =>
      shownTab === undefined
        ? undefined
        : { route: comparedImageRoute, root: shownTab, hash: '' },
    [shownTab],
  );
  useEffect(() => {
    if (shownTab !== undefined && focusOf(shownTab) === undefined) {
      view.current
        ?.querySelector<HTMLElement>(`[${columnFocusAttribute}]`)
        ?.focus({ preventScroll: true });
    }
  }, [shownTab, focusOf]);
  return (
    <div className="repository compare-view" ref={view}>
      <div className="columns compare-columns">
        <Diff
          scope={tab}
          selection={tab}
          path={compare?.name}
          note={noteOf(compare)}
          loading={compare === undefined}
          files={noFiles}
          patch={compare?.patch ?? ''}
          leftOut={noLeftOut}
          whitespaceOnly={noPaths}
          diffs={compare?.version ?? 0}
          largeFiles={noLargeFiles}
          onLoadFile={ignored}
          texts={texts}
          onLoadTexts={loadTexts}
          fileContent={undefined}
          error={compare?.error}
          changeMarks={compare?.entire ?? false}
          entire={compare?.entire ?? false}
          origin={origin}
          findAsked={findAsked}
          filter={undefined}
          options={<CompareOptions tab={tab} />}
          look={{
            sideBySide,
            wordWrap,
            showWhitespace,
            highlightSyntax,
            scrolling,
            root: undefined,
            language,
          }}
          measures={measures}
          measuring={{ measureText, snapCode, keepWrapColumns }}
          tab={{
            find,
            keepFind: (next) => keepFind(tab, next),
            closeFind: () => closeFind(tab),
            place: placeOf(tab),
            keepPlace: keepTabPlace,
          }}
        />
      </div>
    </div>
  );
}
