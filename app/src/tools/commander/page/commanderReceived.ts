import { type CommanderToWebview } from '../shared/protocol';
import type { Side } from '../shared/sides';
import type { CommanderSource, ToViewer, Viewing } from './commanderState';
import type { ToEditor } from './editorState';
import { reduceView } from './view';

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
    case 'viewing': {
      const viewed = viewedOf(message);
      return sameViewed(state.viewed, viewed)
        ? state
        : {
            viewed,
            keptViewed: new Map(state.keptViewed).set(viewed.tab, viewed),
          };
    }
    case 'show':
    case 'hide': {
      const view = reduceView(state.view, message);
      const viewed =
        message.type === 'show' &&
        message.file !== undefined &&
        message.edit !== true
          ? state.keptViewed.get(message.tab)
          : undefined;
      return {
        ...(view !== state.view && { view }),
        ...(state.viewed !== viewed && { viewed }),
        ...(state.edited !== undefined && { edited: undefined }),
      };
    }
    case 'closed':
    case 'left': {
      const view = reduceView(state.view, message);
      const keptViewed = new Map(state.keptViewed);
      keptViewed.delete(message.tab);
      return {
        view,
        keptViewed,
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
