import type { EditorState } from '@codemirror/state';
import { strings } from '../../../lib/shared/strings';
import type { LineEnding } from '../shared/textMarks';
import { endingCounts, endingsField } from './editorEndings';

export interface EndingsShown {
  readonly ending: LineEnding;
  readonly counts: Readonly<Record<LineEnding, number>>;
}

const endingOrder: readonly LineEnding[] = ['lf', 'crlf', 'cr'];

export function endingsShownOf(state: EditorState): EndingsShown {
  return {
    ending: state.field(endingsField).ending,
    counts: endingCounts(state),
  };
}

export function endingsLabel({ ending, counts }: EndingsShown): string {
  const used = endingOrder.filter((each) => counts[each] > 0);
  return used.length > 1
    ? strings.editor.mixed
    : strings.editor.endingNames[used[0] ?? ending];
}

export const linesEnding = ({ ending, counts }: EndingsShown) =>
  endingOrder.some((each) => counts[each] > 0) ? ending : undefined;

export function endingsTitle({ ending, counts }: EndingsShown): string {
  return strings.editor.endingCounts(
    endingOrder
      .filter((each) => counts[each] > 0)
      .map((each) =>
        strings.editor.linesEndingIn(
          counts[each],
          strings.editor.endingNames[each],
        ),
      ),
    strings.editor.endingNames[ending],
  );
}
