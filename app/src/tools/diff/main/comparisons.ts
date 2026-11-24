import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import type { TextRequest } from '../../../components/diff/shared/protocol';
import type { DiffSettings } from '../../../components/diff/shared/settings';
import { gitErrorText } from '../../../lib/main/errorText';
import { uniqueTexts } from '../../../components/diff/main/textRequests';
import type { Log } from '../../../shell/main/log';
import type { Compared } from '../../../shell/main/savedTabs';
import type { Page, ShellAccess } from '../../../shell/main/toolContract';
import {
  CompareTooLarge,
  compareMaxBytes,
  comparedFilesPatch,
  comparedNames,
  comparedText,
  filesAlike,
  type FilesAlike,
  type GitRun,
} from './compare';
import { watchFiles } from './compareWatch';
import { post } from './post';
import { readableSides, VersionMissing, type CopyOf } from './readableSides';
import type { SideListed } from './versionChoice';
import type { ComparedSide } from '../shared/protocol';
import type { DecodedSides } from './decodedSides';
import type { FileHistoryListed } from '../../../components/versions/shared/versions';
import * as fs from 'node:fs';

const sameCompared = (a: Compared, b: Compared): boolean =>
  a.old === b.old &&
  a.new === b.new &&
  a.oldVersion?.rev === b.oldVersion?.rev &&
  a.newVersion?.rev === b.newVersion?.rev;

export interface Comparing {
  readonly tab: string;
  readonly compared: Compared;
  running: AbortController | undefined;
  readonly stop: () => void;
  version: number;
  readonly listed: Partial<Record<ComparedSide, SideListed>>;
}

export class Comparisons {
  readonly shown = new Map<Page, Comparing>();

  constructor(
    private readonly log: Log,
    private readonly run: GitRun,
    private readonly settings: () => DiffSettings,
    private readonly shell: () => ShellAccess,
    private readonly copyOf: CopyOf,
    private readonly historyOf: (
      file: string,
    ) => Promise<FileHistoryListed | undefined>,
    private readonly decoded: (read: Compared) => Promise<DecodedSides>,
  ) {}

  readable(compared: Compared): Promise<Compared> {
    return readableSides(compared, this.copyOf);
  }

  private async decodedOf(compared: Compared): Promise<DecodedSides> {
    return this.decoded(await this.readable(compared));
  }

  of(tab: string): Comparing | undefined {
    for (const comparing of this.shown.values()) {
      if (comparing.tab === tab) {
        return comparing;
      }
    }
    return undefined;
  }

  async show(page: Page, tab: string, compared: Compared): Promise<void> {
    const shown = this.shown.get(page);
    if (shown?.tab === tab && sameCompared(shown.compared, compared)) {
      await this.send(page);
      return;
    }
    this.stop(page);
    const comparing: Comparing = {
      tab,
      compared,
      running: undefined,
      version: 0,
      listed: {},
      stop: watchFiles(
        [
          ...(compared.oldVersion === undefined ? [compared.old] : []),
          ...(compared.newVersion === undefined ? [compared.new] : []),
        ],
        () => {
          if (this.shown.get(page) === comparing) {
            void this.send(page);
          }
        },
        (error) => {
          this.log.error(strings.log.watchingFailed(compared.new));
          this.log.error(error);
          this.shell().notice(page, {
            level: 'error',
            message: strings.messages.couldNotWatchCompared(
              compared.old,
              compared.new,
            ),
          });
        },
      ),
    };
    this.shown.set(page, comparing);
    await this.send(page);
    await this.listVersions(page, comparing);
  }

  private async listVersions(page: Page, comparing: Comparing): Promise<void> {
    const { compared } = comparing;
    const sides: readonly [ComparedSide, string][] = [
      ['old', compared.oldVersion?.file ?? compared.old],
      ['new', compared.newVersion?.file ?? compared.new],
    ];
    for (const [side, file] of sides) {
      const listed = await this.listed(file);
      if (listed === undefined) {
        continue;
      }
      comparing.listed[side] = listed;
      if (this.shown.get(page) === comparing) {
        const { file: _file, ...versions } = listed;
        post(page, { type: 'versions', tab: comparing.tab, side, ...versions });
      }
    }
  }

  async listed(file: string): Promise<SideListed | undefined> {
    const [history, onDisk] = await Promise.all([
      this.historyOf(file).catch(() => undefined),
      fs.promises.stat(file).then(
        (stats) => stats.isFile(),
        () => false,
      ),
    ]);
    return history === undefined || history.versions.length === 0
      ? undefined
      : { ...history, file, onDisk };
  }

  stop(page: Page): void {
    const comparing = this.shown.get(page);
    if (comparing !== undefined) {
      comparing.stop();
      comparing.running?.abort();
      this.shown.delete(page);
    }
  }

  async sendTexts(page: Page, requests: readonly TextRequest[]): Promise<void> {
    const comparing = this.shown.get(page);
    if (comparing === undefined) {
      return;
    }
    const sides = new Map<TextRequest['side'], Promise<string | undefined>>();
    const sideText = (side: TextRequest['side']) => {
      const known = sides.get(side);
      if (known !== undefined) {
        return known;
      }
      const reading = this.decodedOf(comparing.compared).then(
        ({ read }) => comparedText(read, side),
        () => undefined,
      );
      sides.set(side, reading);
      return reading;
    };
    const texts = await Promise.all(
      uniqueTexts(requests).map(async (request) => ({
        path: request.path,
        side: request.side,
        blob: request.blob,
        text: await sideText(request.side),
      })),
    );
    if (this.shown.get(page) === comparing && texts.length > 0) {
      post(page, { type: 'texts', tab: comparing.tab, texts });
    }
  }

  async send(page: Page): Promise<void> {
    const comparing = this.shown.get(page);
    if (comparing === undefined) {
      return;
    }
    const { compared } = comparing;
    const { showEntireFile: entire, ignoreWhitespace } = this.settings();
    const version = ++comparing.version;
    comparing.running?.abort();
    const running = new AbortController();
    comparing.running = running;
    let patch = '';
    let same: FilesAlike | undefined;
    let encodings: DecodedSides['encodings'] = {};
    let withBom: DecodedSides['withBom'];
    let error: Sentence | undefined;
    try {
      const readable = await this.readable(compared);
      const decoded = await this.decoded(readable);
      const { read } = decoded;
      encodings = decoded.encodings;
      patch = await comparedFilesPatch(
        this.run,
        compared,
        { entireFile: entire, ignoreWhitespace },
        running.signal,
        read,
      );
      if (patch === '') {
        same = await filesAlike(readable, read);
      }
      if (decoded.withBom !== undefined) {
        withBom = decoded.withBom;
      }
    } catch (failure) {
      if (running.signal.aborted) {
        return;
      }
      error =
        failure instanceof CompareTooLarge
          ? strings.messages.compareTooLarge(compareMaxBytes / 1024 / 1024)
          : failure instanceof VersionMissing
            ? strings.diff.viewMissing(failure.file)
            : strings.messages.couldNotCompare(
                compared.old,
                compared.new,
                gitErrorText(failure),
              );
    }
    if (this.shown.get(page) !== comparing || comparing.version !== version) {
      return;
    }
    post(page, {
      type: 'compare',
      compare: {
        tab: comparing.tab,
        name: comparedNames(compared)[1],
        old: compared.old,
        new: compared.new,
        ...(compared.oldVersion !== undefined && {
          oldVersion: compared.oldVersion.rev,
        }),
        ...(compared.newVersion !== undefined && {
          newVersion: compared.newVersion.rev,
        }),
        patch,
        entire,
        version,
        ...(same !== undefined && { same }),
        ...(Object.keys(encodings).length > 0 && { encodings }),
        ...(withBom !== undefined && { withBom }),
        ...(error !== undefined && { error }),
      },
    });
  }
}
