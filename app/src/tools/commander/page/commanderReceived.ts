import { type CommanderToWebview } from '../shared/protocol';
import type { Side } from '../shared/sides';
import type { CommanderSource } from './commanderState';
import type { ToEditor } from './editorState';
import { reduceView } from './view';

const editorStreams: ReadonlySet<CommanderToWebview['type']> = new Set<
  ToEditor['type']
>(['editedText', 'askOverwrite', 'askChangedOnDisk']);

export function isEditorStream(
  message: CommanderToWebview,
): message is ToEditor {
  return editorStreams.has(message.type);
}

export function readingKey(tab: string | undefined, side: Side): string {
  return `${tab ?? ''} ${side}`;
}

export function received(
  state: CommanderSource,
  message: CommanderToWebview,
): Partial<CommanderSource> {
  if (isEditorStream(message)) {
    return state;
  }
  switch (message.type) {
    case 'editing':
      return {
        edited: {
          tab: message.tab,
          file: message.file,
          version: message.version,
          encoding: message.encoding,
          bom: message.bom === true,
          onDisk: message.onDisk,
          changed: message.changed === true,
          readOnly: message.readOnly === true,
          made: message.made === true,
          error: message.error,
          endingSources: message.endingSources,
          encodingSources: message.encodingSources,
        },
      };
    case 'textChanged':
      return state.edited?.tab === message.tab
        ? { edited: { ...state.edited, changed: message.changed } }
        : state;
    case 'drives':
      return { drives: message.drives };
    case 'transfer':
      return { transfer: message.view };
    case 'askPassword':
      return {
        askingPassword: {
          ask: message.ask,
          name: message.name,
          wrong: message.wrong,
        },
      };
    case 'askUpdate':
      return {
        askingUpdate: {
          ask: message.ask,
          name: message.name,
          archive: message.archive,
        },
      };
    case 'askExisting': {
      const { tab, side, folder, names, target, move, existing } = message;
      return {
        transferring: { tab, side, folder, names, target, move, existing },
      };
    }
    case 'reading': {
      const readingSides = new Map(state.readingSides);
      const key = readingKey(message.tab, message.side);
      const reads = (readingSides.get(key) ?? 0) + (message.reading ? 1 : -1);
      if (reads > 0) {
        readingSides.set(key, reads);
      } else {
        readingSides.delete(key);
      }
      return { readingSides };
    }
    case 'flatFiles': {
      const view = reduceView(state.view, {
        type: 'flatProgress',
        tab: message.tab,
        side: message.side,
        walk: message.walk,
        progress: message.progress,
      });
      return view === state.view ? state : { view };
    }
    case 'show':
    case 'hide': {
      const view = reduceView(state.view, message);
      return {
        ...(view !== state.view && { view }),
        ...(state.edited !== undefined && { edited: undefined }),
      };
    }
    case 'closed': {
      const view = reduceView(state.view, message);
      return {
        view,
        noAccess: withoutNoAccess(state.noAccess, message.tab),
      };
    }
    case 'noAccess':
      return {
        noAccess: new Map(state.noAccess).set(message.tab, {
          tab: message.tab,
          side: message.side,
          folder: message.folder,
          asAdministrator: message.asAdministrator,
        }),
      };
    default: {
      const view = reduceView(state.view, message);
      return view === state.view ? state : { view };
    }
  }
}

export const noAccessShown = ({ noAccess, view }: CommanderSource) =>
  view.tab === undefined ? undefined : noAccess.get(view.tab);

export function withoutNoAccess(
  noAccess: CommanderSource['noAccess'],
  tab: string | undefined,
): CommanderSource['noAccess'] {
  if (tab === undefined || !noAccess.has(tab)) {
    return noAccess;
  }
  const left = new Map(noAccess);
  left.delete(tab);
  return left;
}

export function released(
  state: CommanderSource,
  tab: string,
): Partial<CommanderSource> {
  return {
    view: reduceView(state.view, { type: 'released', tab }),
    noAccess: withoutNoAccess(state.noAccess, tab),
  };
}
