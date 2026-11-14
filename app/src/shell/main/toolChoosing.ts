import type { ToolChoice, ToWebviewOf } from '../shared/protocol';
import { strings } from '../../lib/shared/strings';
import { isTool, tools as toolIds, type ToolId } from '../shared/tools';
import { sameRoot } from './storage';

import type { Notice, Page, Tab, Tools } from './shell';

interface Asking {
  readonly question: ToWebviewOf<'chooseTool'>;
  readonly fitting: ReadonlySet<ToolId>;
}

const mostSpecificFirst: readonly ToolId[] = ['git', 'commander', 'terminal'];

export interface ToolChoosingHost {
  readonly activeTab: (page: Page) => Tab | undefined;
  readonly notice: (page: Page | undefined, notice: Notice) => void;
}

export class ToolChoosing {
  private askedFolders: readonly string[] = [];
  private asking: Asking | undefined;
  private askingFolders: Promise<void> = Promise.resolve();

  constructor(
    private readonly tools: Tools,
    private readonly host: ToolChoosingHost,
  ) {}

  asked(folders: readonly string[]): void {
    this.askedFolders = [...this.askedFolders, ...folders];
  }

  askFolders(page: Page): Promise<void> {
    return this.inTurn(() => this.ask(page));
  }

  openIn(page: Page): Promise<void> {
    const tab = this.host.activeTab(page);
    if (tab === undefined) {
      return Promise.resolve();
    }
    const folder = this.tools[tab.tool].folderOf(tab);
    if (folder === undefined) {
      this.host.notice(page, {
        level: 'info',
        message: strings.messages.noFolder(strings.tools[tab.tool]),
      });
      return Promise.resolve();
    }
    return this.inTurn(() => this.choose(page, [folder], tab.tool));
  }

  private inTurn(asking: () => Promise<void>): Promise<void> {
    this.askingFolders = this.askingFolders.catch(() => undefined).then(asking);
    return this.askingFolders;
  }

  private async ask(page: Page): Promise<void> {
    const folders = [
      ...(this.asking?.question.folders ?? []),
      ...this.askedFolders,
    ].filter(
      (folder, index, all) =>
        all.findIndex((other) => sameRoot(other, folder)) === index,
    );
    this.askedFolders = [];
    if (folders.length === 0) {
      return;
    }
    await this.choose(page, folders, undefined);
  }

  private async choose(
    page: Page,
    folders: readonly string[],
    asker: ToolId | undefined,
  ): Promise<void> {
    const fits = await Promise.all(
      toolIds.map(async (tool) => ({
        tool,
        folders: await Promise.all(
          folders.map(
            async (folder) =>
              tool !== asker &&
              (await this.tools[tool].fits(folder).catch(() => false)),
          ),
        ),
      })),
    );
    const opened = folders.filter((_, index) =>
      fits.some((fit) => fit.folders[index]),
    );
    for (const folder of folders) {
      if (!opened.includes(folder)) {
        this.host.notice(page, {
          level: 'error',
          message: strings.messages.noToolOpens(folder),
        });
      }
    }
    if (opened.length === 0) {
      this.asking = undefined;
      return;
    }
    const choices: ToolChoice[] = fits.map((fit) => ({
      tool: fit.tool,
      fits: fit.folders.some(Boolean),
    }));
    const specificFirst = mostSpecificFirst.flatMap((tool) =>
      fits.filter((fit) => fit.tool === tool),
    );
    const picked =
      specificFirst.find((fit) =>
        opened.every((folder) => fit.folders[folders.indexOf(folder)]),
      )?.tool ?? specificFirst.find((fit) => fit.folders.some(Boolean))?.tool;
    this.asking = {
      question: { type: 'chooseTool', folders: opened, choices, picked },
      fitting: new Set(
        choices.filter((choice) => choice.fits).map((choice) => choice.tool),
      ),
    };
    page.post(this.asking.question);
  }

  async openWith(page: Page, tool: unknown): Promise<void> {
    const { asking } = this;
    if (asking === undefined) {
      return;
    }
    if (tool === undefined) {
      this.asking = undefined;
      return;
    }
    if (!isTool(tool) || !asking.fitting.has(tool)) {
      page.post(asking.question);
      return;
    }
    this.asking = undefined;
    await this.tools[tool].open(page, asking.question.folders);
  }
}
