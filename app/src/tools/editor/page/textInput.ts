import { deleteBracketPair } from '@codemirror/autocomplete';
import { redo, selectAll, undo } from '@codemirror/commands';
import { type Extension, type Transaction } from '@codemirror/state';
import { keyPressed } from '../../../lib/page/shortcuts';
import { copied, cut, pasted } from './clipboard';
import { cellAt, gridOf } from './grid';
import { editorKeymap } from './keymap';
import {
  surfaceEvents,
  surfacePlugin,
  type EditorSurface,
  type SurfacePart,
  type SurfaceUpdate,
} from './surface';
import { bracketsClose } from '../../../components/editing/page/typed';
import { InputSession } from '../../../components/editing/page/inputSession';
import {
  characterDeleted,
  groupDeleted,
} from '../../../components/editing/page/textSteps';

class EditorInput implements SurfacePart {
  private readonly session: InputSession;
  copiedLines: string | undefined;

  constructor(view: EditorSurface) {
    this.session = new InputSession({
      get state() {
        return view.state;
      },
      element: view.contentDOM,
      scroller: view.scrollDOM,
      dispatch: (change) => view.dispatch(change),
      cellOf: (at, assoc) => {
        const grid = gridOf(view);
        if (grid === undefined) {
          return undefined;
        }
        const cell = cellAt(view, grid, at, assoc);
        return new DOMRect(cell.left, cell.top, cell.width, cell.height);
      },
      control: () => view.scrollDOM.getBoundingClientRect(),
    });
  }

  update(update: SurfaceUpdate): void {
    this.session.update(update);
  }

  destroy(): void {
    this.session.destroy();
  }
}

const input = surfacePlugin((view) => new EditorInput(view));

function done(view: EditorSurface, change: Transaction | undefined): boolean {
  if (change === undefined) {
    return false;
  }
  view.dispatch(change);
  return true;
}

function keyed(event: KeyboardEvent, view: EditorSurface): boolean {
  const { state } = view;
  const character = keyPressed(editorKeymap.deleteCharacter, event);
  if (character !== undefined) {
    return (
      (character < 0 &&
        state.facet(bracketsClose) &&
        deleteBracketPair({
          state,
          dispatch: (change) => view.dispatch(change),
        })) ||
      done(view, characterDeleted(state, character > 0)) ||
      true
    );
  }
  const word = keyPressed(editorKeymap.deleteWord, event);
  if (word !== undefined) {
    return done(view, groupDeleted(state, word > 0)) || true;
  }
  if (keyPressed(editorKeymap.selectAll, event) !== undefined) {
    return selectAll({ state, dispatch: (change) => view.dispatch(change) });
  }
  return false;
}

export const textInput: Extension = [
  input,
  surfaceEvents({
    keydown: keyed,
    beforeinput(event, view) {
      const command =
        event.inputType === 'historyUndo'
          ? undo
          : event.inputType === 'historyRedo'
            ? redo
            : undefined;
      return (
        command?.({
          state: view.state,
          dispatch: (change) => view.dispatch(change),
        }) ?? false
      );
    },
    copy(event, view) {
      const taken = copied(view.state);
      const part = view.plugin(input);
      if (
        event.clipboardData === null ||
        (taken.text === '' && !taken.linewise)
      ) {
        return false;
      }
      if (part !== undefined) {
        part.copiedLines = taken.linewise ? taken.text : undefined;
      }
      event.clipboardData.clearData();
      event.clipboardData.setData('text/plain', taken.text);
      return true;
    },
    cut(event, view) {
      const taken = copied(view.state);
      const part = view.plugin(input);
      if (
        event.clipboardData === null ||
        (taken.text === '' && !taken.linewise)
      ) {
        return false;
      }
      if (part !== undefined) {
        part.copiedLines = taken.linewise ? taken.text : undefined;
      }
      event.clipboardData.clearData();
      event.clipboardData.setData('text/plain', taken.text);
      done(view, cut(view.state, taken));
      return true;
    },
    paste(event, view) {
      const text =
        event.clipboardData?.getData('text/plain') ||
        event.clipboardData?.getData('text/uri-list');
      return (
        text !== undefined &&
        text !== '' &&
        (done(
          view,
          pasted(view.state, text, view.plugin(input)?.copiedLines),
        ) ||
          true)
      );
    },
  }),
];
