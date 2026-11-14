import {
  otherSide,
  type CommanderToWebview,
  type Side,
} from '../shared/protocol';
import type {
  CommanderSource,
  Deleting,
  ToViewer,
  Transferring,
  Viewing,
} from './commanderState';
import type { ToEditor } from './editorState';
import { reduceView, type CommanderView } from './view';

const viewerStreams: ReadonlySet<CommanderToWebview['type']> = new Set<
  ToViewer['type']
>(['rows', 'text', 'bytes', 'found', 'pdfPlace']);

export function isViewerStream(
  message: CommanderToWebview,
): message is ToViewer {
  return viewerStreams.has(message.type);
}

const editorStreams: ReadonlySet<CommanderToWebview['type']> = new Set<
  ToEditor['type']
>(['editedText', 'askOverwrite', 'askChangedOnDisk']);

export function isEditorStream(
  message: CommanderToWebview,
): message is ToEditor {
  return editorStreams.has(message.type);
}

function viewedOf(message: Extract<CommanderToWebview, { type: 'viewing' }>) {
  return {
    tab: message.tab,
    size: message.size,
    ...(message.version !== undefined && { version: message.version }),
    ...(message.binary !== undefined && { binary: message.binary }),
    ...(message.hidden !== undefined && { hidden: message.hidden }),
    ...(message.detected !== undefined && { detected: message.detected }),
    ...(message.error !== undefined && { error: message.error }),
  };
}

function sameViewed(shown: Viewing | undefined, told: Viewing): boolean {
  return (
    shown !== undefined &&
    shown.tab === told.tab &&
    shown.size === told.size &&
    shown.version === told.version &&
    shown.binary === told.binary &&
    shown.detected === told.detected &&
    shown.error === told.error &&
    shown.hidden?.length === told.hidden?.length &&
    (shown.hidden ?? []).every((part, index) => part === told.hidden?.[index])
  );
}

export function readingKey(tab: string | undefined, side: Side): string {
  return `${tab ?? ''} ${side}`;
}

export function received(
  state: CommanderSource,
  message: CommanderToWebview,
): Partial<CommanderSource> {
  if (isViewerStream(message) || isEditorStream(message)) {
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
    case 'readingArchive': {
      const readingArchives = new Map(state.readingArchives);
      const key = readingKey(message.tab, message.side);
      if (message.name === undefined) {
        readingArchives.delete(key);
      } else {
        readingArchives.set(key, message.name);
      }
      return { readingArchives };
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
    case 'viewing': {
      const viewed = viewedOf(message);
      return sameViewed(state.viewed, viewed) ? state : { viewed };
    }
    case 'show':
    case 'hide': {
      const view = reduceView(state.view, message);
      return {
        ...(view !== state.view && { view }),
        ...(state.viewed !== undefined && { viewed: undefined }),
        ...(state.edited !== undefined && { edited: undefined }),
      };
    }
    case 'noAccess':
      return {
        noAccess: {
          side: message.side,
          folder: message.folder,
          asAdministrator: message.asAdministrator,
        },
      };
    default: {
      const view = reduceView(state.view, message);
      return view === state.view ? state : { view };
    }
  }
}

export function stillShown(
  view: CommanderView,
  { tab, side, folder }: Pick<Deleting, 'tab' | 'side' | 'folder'>,
) {
  return view.tab === tab && view.panes[side]?.folder === folder;
}

export function stillTargeted(view: CommanderView, transferring: Transferring) {
  return (
    stillShown(view, transferring) &&
    view.panes[otherSide(transferring.side)]?.folder === transferring.target
  );
}
