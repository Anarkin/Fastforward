import { gitErrorText } from './cli/errorText';
import {
  CompareTooLarge,
  compareMaxBytes,
  comparedFilesPatch,
  comparedNames,
  comparedText,
  filesAlike,
} from './cli/compare';
import { watchFiles } from './compareWatch';
import type { Log } from '../../../shell/main/log';
import type { TextRequest } from '../shared/protocol';
import { strings, type Sentence } from '../../../lib/shared/strings';
import type { Compared } from '../../../shell/main/storage';
import type { GitStorage } from './storage';
import { type Session, type Comparing, uniqueTexts } from './tabContext';
import type { Watching } from './watching';

export class CompareTabs {
  readonly comparisons = new Map<string, Comparing>();

  constructor(
    private readonly log: Log,
    private readonly gitPath: string,
    private readonly storage: GitStorage,
    private readonly watching: Watching,
  ) {}

  async showCompare(
    session: Session,
    tab: string,
    compared: Compared,
  ): Promise<void> {
    this.watching.stopWatching(session);
    const shown = session.comparing;
    if (
      shown?.tab === tab &&
      shown.compared.old === compared.old &&
      shown.compared.new === compared.new
    ) {
      await this.sendCompare(session);
      return;
    }
    if (shown !== undefined) {
      this.forgetComparing(shown);
    }
    const comparing: Comparing = {
      tab,
      compared,
      running: undefined,
      version: 0,
      stop: watchFiles(
        [compared.old, compared.new],
        () => {
          if (session.comparing === comparing) {
            void this.sendCompare(session);
          }
        },
        (error) => {
          this.log.error(strings.log.watchingFailed(compared.new));
          this.log.error(error);
          session.post({
            type: 'notice',
            level: 'error',
            message: strings.messages.couldNotWatchCompared(
              compared.old,
              compared.new,
            ),
          });
        },
      ),
    };
    this.comparisons.set(tab, comparing);
    session.comparing = comparing;
    await this.sendCompare(session);
  }

  async sendCompareTexts(
    session: Session,
    requests: readonly TextRequest[],
  ): Promise<void> {
    const { comparing } = session;
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
    if (session.comparing === comparing && texts.length > 0) {
      session.post({ type: 'compareTexts', tab: comparing.tab, texts });
    }
  }

  stopComparing(session: Session): void {
    const { comparing } = session;
    if (comparing !== undefined) {
      this.forgetComparing(comparing);
      session.comparing = undefined;
      session.post({ type: 'compare', compare: undefined });
    }
  }

  private forgetComparing(comparing: Comparing): void {
    comparing.stop();
    comparing.running?.abort();
    if (this.comparisons.get(comparing.tab) === comparing) {
      this.comparisons.delete(comparing.tab);
    }
  }

  async sendCompare(session: Session): Promise<void> {
    const { comparing } = session;
    if (comparing === undefined) {
      return;
    }
    const { compared } = comparing;
    const { showEntireFile: entire, ignoreWhitespace } = this.storage.layout;
    const version = ++comparing.version;
    comparing.running?.abort();
    const running = new AbortController();
    comparing.running = running;
    let patch = '';
    let same: 'identical' | 'whitespace' | undefined;
    let error: Sentence | undefined;
    try {
      patch = await comparedFilesPatch(
        this.gitPath,
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
    if (session.comparing !== comparing || comparing.version !== version) {
      return;
    }
    session.post({
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
