import * as os from 'node:os';
import * as path from 'node:path';
import {
  cloneProblem,
  clonableUrl,
  nameProblem,
  type CloneAsk,
  type CloneProgress,
  type CloneView,
} from '../shared/clone';
import type { GitToHost, GitToWebviewOf } from '../shared/protocol';
import type { ToWebviewOf } from '../../../shell/shared/protocol';
import type { Log } from '../../../shell/main/log';
import { strings } from '../../../shared/strings';
import { cloneRepository, cloneTargetProblem, removeClone } from './cli/clone';
import { gitErrorText } from './cli/errorText';
import { isFolder } from './cli/repository';

export type CloneMessage = Extract<
  GitToHost,
  {
    readonly type:
      | 'openClone'
      | 'closeClone'
      | 'chooseCloneFolder'
      | 'checkCloneTarget'
      | 'clone'
      | 'stopClone';
  }
>;

type ClonePost =
  | GitToWebviewOf<'clone' | 'cloneFolder' | 'cloneTarget'>
  | ToWebviewOf<'notice'>;

export interface CloneHost {
  readonly post: (message: ClonePost) => void;
  readonly open: (target: string) => Promise<void>;
  readonly track: (work: Promise<void>) => void;
  readonly chooseFolder: (from: string) => Promise<string | undefined>;
  readonly clipboardText: () => Promise<string>;
  readonly savedFolder: () => string | undefined;
  readonly saveFolder: (folder: string) => void;
}

interface Running {
  readonly ask: CloneAsk;
  readonly target: string;
  readonly stop: AbortController;
  progress: CloneProgress | undefined;
}

type Form = Extract<CloneView, { readonly kind: 'form' }>;

export class Clones {
  private shown = false;
  private running: Running | undefined;
  private form: Form | undefined;

  constructor(
    private readonly log: Log,
    private readonly gitPath: string,
    private readonly host: CloneHost,
    private readonly quitting: AbortSignal,
  ) {}

  pageLoaded(): void {
    this.shown = false;
  }

  async receive(message: CloneMessage): Promise<void> {
    switch (message.type) {
      case 'openClone':
        this.shown = true;
        this.form ??= {
          kind: 'form',
          url: clonableUrl(await this.host.clipboardText()) ?? '',
          folder: this.host.savedFolder() ?? os.homedir(),
          name: '',
        };
        this.show();
        return;
      case 'closeClone':
        this.shown = false;
        if (this.running === undefined) {
          this.form = undefined;
        }
        this.host.post({ type: 'clone', view: undefined });
        return;
      case 'chooseCloneFolder': {
        const folder = await this.host.chooseFolder(message.folder);
        if (folder !== undefined) {
          this.host.post({ type: 'cloneFolder', folder });
        }
        return;
      }
      case 'checkCloneTarget': {
        const { folder, name } = message;
        const problem =
          nameProblem(name) ?? (await cloneTargetProblem(folder, name));
        this.host.post({
          type: 'cloneTarget',
          folder,
          name,
          ...(problem !== undefined && { problem }),
        });
        return;
      }
      case 'clone':
        await this.start({
          url: message.url.trim(),
          folder: message.folder,
          name: message.name,
        });
        return;
      case 'stopClone':
        this.running?.stop.abort();
        return;
    }
  }

  private async start(ask: CloneAsk): Promise<void> {
    if (this.running !== undefined) {
      return;
    }
    const problem =
      cloneProblem(ask) ?? (await cloneTargetProblem(ask.folder, ask.name));
    if (problem !== undefined) {
      this.showForm({ ...ask, message: problem });
      return;
    }
    const target = path.join(ask.folder, ask.name);
    const existed = await isFolder(target);
    const running: Running = {
      ask,
      target,
      stop: new AbortController(),
      progress: undefined,
    };
    this.running = running;
    this.form = undefined;
    this.host.saveFolder(ask.folder);
    this.log.info(strings.log.cloning(ask.url, target));
    this.show();
    this.host.track(this.run(running, existed));
  }

  private async run(running: Running, existed: boolean): Promise<void> {
    const { ask, target, stop } = running;
    try {
      await cloneRepository(this.gitPath, ask.folder, ask.url, ask.name, {
        stop: AbortSignal.any([stop.signal, this.quitting]),
        onProgress: (progress) => this.progressed(running, progress),
      });
    } catch (error) {
      await removeClone(target, existed).catch((removing: unknown) => {
        this.log.error(strings.log.removingCloneFailed(target));
        this.log.error(removing);
      });
      this.running = undefined;
      if (stop.signal.aborted || this.quitting.aborted) {
        this.log.info(strings.log.cloneStopped(ask.url));
        this.form = { kind: 'form', ...ask };
        if (this.shown) {
          this.show();
        }
        return;
      }
      const text = gitErrorText(error);
      this.log.error(strings.log.cloneFailed(ask.url));
      this.log.error(error instanceof Error ? error : text);
      this.form = { kind: 'form', ...ask, message: text };
      if (this.shown) {
        this.show();
      } else {
        this.host.post({
          type: 'notice',
          level: 'error',
          message: strings.messages.couldNotClone(ask.url, text),
        });
      }
      return;
    }
    this.running = undefined;
    this.log.info(strings.log.cloned(ask.url, target));
    if (this.shown) {
      this.shown = false;
      this.host.post({ type: 'clone', view: undefined });
    } else {
      this.host.post({
        type: 'notice',
        level: 'info',
        message: strings.messages.cloned(ask.url, target),
      });
    }
    await this.host.open(target);
  }

  private progressed(running: Running, progress: CloneProgress): void {
    const { progress: last } = running;
    if (last?.phase === progress.phase && last.percent === progress.percent) {
      return;
    }
    running.progress = progress;
    if (this.shown && this.running === running) {
      this.show();
    }
  }

  private showForm(form: Omit<Form, 'kind'>): void {
    this.form = { kind: 'form', ...form };
    this.shown = true;
    this.show();
  }

  private show(): void {
    const { running } = this;
    this.host.post({
      type: 'clone',
      view:
        running === undefined
          ? this.form
          : {
              kind: 'running',
              url: running.ask.url,
              target: running.target,
              ...(running.progress !== undefined && {
                progress: running.progress,
              }),
            },
    });
  }
}
