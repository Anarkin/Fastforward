import * as path from 'node:path';
import type { Page } from '../../../../../shell/main/toolContract';
import type { ToWebview } from '../../../../../shell/shared/protocol';
import { pathParts } from '../../../../../lib/shared/pathParts';
import { ViewerTool } from '../../../../../tools/viewer/main/tool';
import type { PdfPlace } from '../../../../../tools/viewer/shared/pdf';
import type {
  ViewerToHost,
  ViewerToWebview,
} from '../../../../../tools/viewer/shared/protocol';
import type { TextEncoding } from '../../../../../components/encodings/shared/textEncodings';
import type { FileHistoryListed } from '../../../../../components/versions/shared/versions';
import { fakeShell } from '../../commander/main/fakeShell';
import type { PatternSearch } from '../../../../../lib/main/patternSearch';

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

export function viewer({ patterns }: { patterns?: PatternSearch } = {}) {
  const watching: { file: string; changed: () => void }[] = [];
  const places = new Map<string, { place: PdfPlace; file: string }>();
  const edited: {
    readonly file: string;
    readonly at: { readonly byte: number; readonly encoding?: TextEncoding };
  }[] = [];
  const closed: string[] = [];
  const versions = new Map<string, string>();
  const histories = new Map<string, FileHistoryListed>();
  const comparedHistories: (readonly [string, string | undefined])[] = [];
  const clipboard: string[] = [];
  const copying: { until: Promise<void> | undefined } = { until: undefined };
  const tool = new ViewerTool({
    copy: (text) => {
      clipboard.push(text);
    },
    codePage: () => Promise.resolve('windows-1250'),
    fileTabSize: (file) =>
      Promise.resolve(
        file.endsWith('.go')
          ? { size: 8, key: 'tab_width' as const, file: '.editorconfig' }
          : undefined,
      ),
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
    editViewed: (_page, file, at) => {
      edited.push({ file, at });
      return Promise.resolve();
    },
    closed: (file) => {
      closed.push(file);
    },
    fileHistory: (file) => Promise.resolve(histories.get(file)),
    compareHistory: (_page, file, rev) => {
      comparedHistories.push([file, rev]);
      return Promise.resolve();
    },
    versionCopy: async (file, rev) => {
      await copying.until;
      const copy = versions.get(`${rev} ${file}`);
      return copy === undefined
        ? { kind: 'missing' }
        : { kind: 'file', file: copy };
    },
    ...(patterns !== undefined && { patterns }),
  });
  const page = new ViewerPage();
  const { shell, pages, tabs, notices, versionsSet, tabsOpened } =
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
    comparedHistories,
    versionsSet,
    tabsOpened,
    clipboard,
    copying,
  };
}

export const forged = (json: string): ViewerToHost => JSON.parse(json);
