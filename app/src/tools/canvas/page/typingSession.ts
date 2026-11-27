import {
  useCallback,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import {
  ChangeSet,
  EditorSelection,
  EditorState,
  Transaction,
  type TransactionSpec,
} from '@codemirror/state';
import {
  InputSession,
  type InputUpdate,
} from '../../../components/editing/page/inputSession';
import { keptOf } from '../../../components/editing/page/plainText';
import type { Board } from '../shared/board';
import type { Unit } from './grid';
import { placeOf } from './nodeText';
import type { Typing } from './state';
import { typedLayout } from './typedLayout';
import type { Caret } from './typing';

export interface ClientBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

type CellOf = (offset: number, assoc: number) => ClientBox | undefined;

interface Placed {
  readonly origin: { readonly column: number; readonly row: number };
  readonly cell: { readonly width: number; readonly height: number };
  readonly left: number;
  readonly top: number;
  readonly unit: Unit;
  readonly widths: Parameters<typeof typedLayout>[2];
}

function typedCellOf(board: Board, drawn: Placed, typing: Typing): CellOf {
  const layout = typedLayout(board, drawn.unit, drawn.widths, typing);
  return (offset, assoc) => {
    const place =
      layout === undefined
        ? undefined
        : placeOf(layout.rows, offset, layout.widths, assoc);
    if (layout === undefined || place === undefined) {
      return undefined;
    }
    const column = layout.area.column + place.column - layout.across;
    const row = layout.area.row + place.row - layout.scroll;
    return {
      left: drawn.left + (column - drawn.origin.column) * drawn.cell.width,
      top: drawn.top + (row - drawn.origin.row) * drawn.cell.height,
      width: Math.max(1, place.cells) * drawn.cell.width,
      height: drawn.cell.height,
    };
  };
}

const rectOf = ({ left, top, width, height }: ClientBox) =>
  new DOMRect(left, top, width, height);

const lineFeedsOnly = EditorState.lineSeparator.of('\n');

const selectionOf = (caret: Caret) =>
  EditorSelection.create([
    EditorSelection.range(
      caret.anchor,
      caret.head,
      caret.goalColumn,
      undefined,
      caret.assoc,
    ),
  ]);

const stateOf = (caret: Caret) =>
  EditorState.create({
    doc: caret.text,
    selection: selectionOf(caret),
    extensions: lineFeedsOnly,
  });

function caretOf(state: EditorState): Caret {
  const { main } = state.selection;
  return {
    text: state.doc.toString(),
    anchor: main.anchor,
    head: main.head,
    ...keptOf(main),
  };
}

const sameCaret = (one: Caret, other: Caret) =>
  one.text === other.text &&
  one.anchor === other.anchor &&
  one.head === other.head &&
  one.goalColumn === other.goalColumn &&
  (one.assoc ?? 0) === (other.assoc ?? 0);

const updateOf = (
  transaction: Transaction,
  geometryChanged = transaction.docChanged,
): InputUpdate => ({
  state: transaction.state,
  startState: transaction.startState,
  transactions: [transaction],
  changes: transaction.changes,
  docChanged: transaction.docChanged,
  selectionSet: transaction.selection !== undefined,
  geometryChanged,
});

const placedAnew = (state: EditorState): InputUpdate => ({
  state,
  startState: state,
  transactions: [],
  changes: ChangeSet.empty(state.doc.length),
  docChanged: false,
  selectionSet: false,
  geometryChanged: true,
});

interface Session {
  readonly input: InputSession;
  readonly kept: { state: EditorState };
}

export function useTypingSession(
  element: RefObject<HTMLElement | null>,
  typing: Typing | undefined,
  typed: (caret: Caret) => void,
): (
  board: Board,
  drawn: Placed | undefined,
  typing: Typing | undefined,
  control: ClientBox,
) => void {
  const session = useRef<Session>(undefined);
  const boxes = useRef<{ cellOf: CellOf; control: ClientBox }>(undefined);
  const id = typing?.session;
  const started = useEffectEvent(() => typing);
  const onTyped = useEffectEvent((caret: Caret) => typed(caret));

  useLayoutEffect(() => {
    const host = element.current;
    const start = started();
    if (host === null || id === undefined || start === undefined) {
      return undefined;
    }
    const kept = { state: stateOf(start) };
    const dispatch = (change: Transaction | TransactionSpec) => {
      const transaction =
        change instanceof Transaction ? change : kept.state.update(change);
      kept.state = transaction.state;
      input.update(updateOf(transaction));
      onTyped(caretOf(transaction.state));
    };
    const input: InputSession = new InputSession({
      get state() {
        return kept.state;
      },
      element: host,
      dispatch,
      cellOf: (at, assoc) => {
        const box = boxes.current?.cellOf(at, assoc);
        return box === undefined ? undefined : rectOf(box);
      },
      control: () =>
        rectOf(boxes.current?.control ?? host.getBoundingClientRect()),
    });
    session.current = { input, kept };
    return () => {
      input.destroy();
      session.current = undefined;
    };
  }, [element, id]);

  useLayoutEffect(() => {
    const current = session.current;
    if (current === undefined || typing === undefined) {
      return;
    }
    const { state } = current.kept;
    if (sameCaret(caretOf(state), typing)) {
      return;
    }
    const transaction = state.update({
      ...(state.doc.toString() !== typing.text && {
        changes: { from: 0, to: state.doc.length, insert: typing.text },
      }),
      selection: selectionOf(typing),
    });
    current.kept.state = transaction.state;
    current.input.update(updateOf(transaction, true));
  }, [typing]);

  return useCallback(
    (
      board: Board,
      drawn: Placed | undefined,
      now: Typing | undefined,
      control: ClientBox,
    ) => {
      if (drawn === undefined || now === undefined) {
        return;
      }
      boxes.current = { cellOf: typedCellOf(board, drawn, now), control };
      const current = session.current;
      current?.input.update(placedAnew(current.kept.state));
    },
    [],
  );
}
