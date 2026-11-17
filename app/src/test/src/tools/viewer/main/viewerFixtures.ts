import * as path from 'node:path';
import type { Page } from '../../../../../shell/main/toolContract';
import type { ToWebview } from '../../../../../shell/shared/protocol';
import { pathParts } from '../../../../../lib/shared/pathParts';
import { ViewerTool } from '../../../../../tools/viewer/main/tool';
import type { PdfPlace } from '../../../../../tools/viewer/shared/pdf';
import type {
  ViewedVersion,
  ViewerToHost,
  ViewerToWebview,
} from '../../../../../tools/viewer/shared/protocol';
import type { TextEncoding } from '../../../../../components/encodings/shared/textEncodings';
import { fakeShell } from '../../commander/main/fakeShell';

export class ViewerPage implements Page {
  readonly messages: ViewerToWebview[] = [];
  disposed = false;

  post(message: ToWebview): void {
    if (message.type === 'tool' && message.tool === 'viewer') {
      this.messages.push(message.message);
    }
  }

  of<T extends ViewerToWebview['type']>(
    type: T,
  ): Extract<ViewerToWebview, { readonly type: T }>[] {
    return this.messages.filter(
      (message): message is Extract<ViewerToWebview, { readonly type: T }> =>
        message.type === type,
    );
  }
}

export function viewer() {
  const watching: { file: string; changed: () => void }[] = [];
  const places = new Map<string, { place: PdfPlace; file: string }>();
  const edited: {
    readonly tab: string;
    readonly file: string;
    readonly at: { readonly byte: number; readonly encoding?: TextEncoding };
  }[] = [];
  const closed: string[] = [];
  const versions = new Map<string, string>();
  const histories = new Map<
    string,
    { versions: readonly ViewedVersion[]; staged: boolean; changed: boolean }
  >();
  const tool = new ViewerTool({
    codePage: () => Promise.resolve('windows-1250'),
    watch: (file, changed) => {
      const watch = { file, changed };
      watching.push(watch);
      return () => watching.splice(watching.indexOf(watch), 1);
    },
    pdfPlaces: {
      of: (fingerprint) => Promise.resolve(places.get(fingerprint)?.place),
      save: (fingerprint, place, viewed) => {
        places.set(fingerprint, { place, file: viewed });
        return Promise.resolve();
      },
    },
    hiddenParts: (file) =>
      Promise.resolve(
        pathParts(file).map((part) => path.basename(part.path).startsWith('.')),
      ),
    fileIcon: (file) =>
      Promise.resolve(new TextEncoder().encode(`icon of ${file}`)),
    editViewed: (_page, tab, file, at) => {
      edited.push({ tab, file, at });
      return Promise.resolve();
    },
    closed: (file) => {
      closed.push(file);
    },
    fileHistory: (file) => Promise.resolve(histories.get(file)),
    versionCopy: (file, rev) => {
      const copy = versions.get(`${rev} ${file}`);
      return Promise.resolve(
        copy === undefined ? { kind: 'missing' } : { kind: 'file', file: copy },
      );
    },
  });
  const page = new ViewerPage();
  const { shell, pages, tabs, notices, versionsSet, turnedToView } =
    fakeShell(page);
  tool.attach(shell);
  const send = (message: ViewerToHost, from: Page = page) =>
    tool.receive(from, message);
  const watched = () => watching.map((watch) => watch.file).toSorted();
  const change = async (changed: string) => {
    for (const watch of watching.filter((each) => each.file === changed)) {
      watch.changed();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return {
    tool,
    page,
    pages,
    tabs,
    notices,
    send,
    watched,
    change,
    places,
    edited,
    closed,
    versions,
    histories,
    versionsSet,
    turnedToView,
  };
}

export const forged = (json: string): ViewerToHost => JSON.parse(json);
