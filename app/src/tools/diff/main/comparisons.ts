import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import type { TextRequest } from '../../../lib/shared/changes';
import type { DiffSettings } from '../../../lib/shared/diffSettings';
import { gitErrorText } from '../../../lib/main/errorText';
import { uniqueTexts } from '../../../lib/main/textRequests';
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
  type GitRun,
} from './compare';
import { watchFiles } from './compareWatch';
import { post } from './post';

export interface Comparing {
  readonly tab: string;
  readonly compared: Compared;
  running: AbortController | undefined;
  readonly stop: () => void;
  version: number;
}

export class Comparisons {
  readonly shown = new Map<Page, Comparing>();

  constructor(
    private readonly log: Log,
    private readonly run: GitRun,
    private readonly settings: () => DiffSettings,
    private readonly shell: () => ShellAccess,
  ) {}

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
    if (
      shown?.tab === tab &&
      shown.compared.old === compared.old &&
      shown.compared.new === compared.new
    ) {
      await this.send(page);
      return;
    }
    this.stop(page);
    const comparing: Comparing = {
      tab,
      compared,
      running: undefined,
      version: 0,
      stop: watchFiles(
        [compared.old, compared.new],
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
      const reading = comparedText(comparing.compared, side);
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
    let same: 'identical' | 'whitespace' | undefined;
    let error: Sentence | undefined;
    try {
      patch = await comparedFilesPatch(
        this.run,
        compared,
        { entireFile: entire, ignoreWhitespace },
        running.signal,
      );
      if (patch === '') {
        same = await filesAlike(compared);
      }
    } catch (failure) {
      if (running.signal.aborted) {
        return;
      }
      error =
        failure instanceof CompareTooLarge
          ? strings.messages.compareTooLarge(compareMaxBytes / 1024 / 1024)
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
        patch,
        entire,
        version,
        ...(same !== undefined && { same }),
        ...(error !== undefined && { error }),
      },
    });
  }
}
