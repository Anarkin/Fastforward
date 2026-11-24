import { useEffect, useMemo, useRef, useState } from 'react';
import { useBinding } from '../../../lib/page/shortcuts';
import type { FileChange } from '../../../lib/shared/changes';
import { strings } from '../../../lib/shared/strings';
import {
  focusBack,
  useFocusKeeper,
  type KeptFocus,
} from '../../../lib/page/viewFocus';
import { useRestore } from '../../../lib/page/restore';
import { columnFocusAttribute } from '../../../lib/page/columnFocus';
import { diffKeymap } from '../../../components/diff/page/keymap';
import type { LeftOut } from '../../../components/diff/shared/protocol';
import type { DiffFile } from '../../../components/diff/page/diff';
import type { LoadedText } from '../../../components/diff/page/sideTexts';
import { SlicedDiff } from '../../../components/diff/page/slicedDiff';
import { useTextViewSettings } from '../../../shell/page/textViewSettings';
import type { ComparedSide, CompareView as Compared } from '../shared/protocol';
import { comparedImageRoute } from '../shared/images';
import { useDiff, useDiffActions, useDiffStore } from './store';
import { languageKeyOf } from './tabView';
import { CompareVersions } from './compareVersions';

const noFiles: readonly FileChange[] = [];
const noLeftOut: readonly LeftOut[] = [];
const noPaths: readonly string[] = [];
const noLargeFiles: ReadonlyMap<string, DiffFile> = new Map();
const noTexts: ReadonlyMap<string, LoadedText> = new Map();
const ignored = () => undefined;

function readAsOf(compare: Compared | undefined): string | undefined {
  const encodings = compare?.encodings;
  if (encodings === undefined) {
    return undefined;
  }
  const { short } = strings.encodings;
  const named = (side: ComparedSide) => {
    const name = short[encodings[side] ?? 'utf-8'];
    return compare?.withBom?.includes(side) === true
      ? strings.editor.shortWithBom(name)
      : name;
  };
  return strings.diff.readAs(named('old'), named('new'));
}

function noteOf(compare: Compared | undefined): string | undefined {
  switch (compare?.same) {
    case 'identical':
      return strings.diff.identical;
    case 'encoding':
      return strings.diff.onlyEncoding;
    case 'whitespace':
      return strings.diff.onlyWhitespace;
    default:
      return undefined;
  }
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
  const textView = useTextViewSettings();
  const store = useDiffStore();
  const { loadTexts, focusOf, keepFocus } = useDiffActions();
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
      <div className="columns bars-outside compare-columns">
        <SlicedDiff
          store={store}
          textView={textView}
          root={undefined}
          wholePaths={compare && { old: compare.old, new: compare.new }}
          languageKey={languageKeyOf(tab)}
          scope={tab}
          selection={tab}
          path={compare?.name}
          note={noteOf(compare)}
          readAs={readAsOf(compare)}
          heading={<CompareVersions />}
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
          entire={compare?.entire ?? false}
          origin={origin}
          findAsked={findAsked}
          filter={undefined}
        />
      </div>
    </div>
  );
}
