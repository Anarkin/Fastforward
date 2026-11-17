import * as path from 'node:path';
import type { Page } from '../../../shell/main/toolContract';
import { post } from './post';
import type { CommanderAccess } from './access';

export type ArchivePasswordsAccess = Pick<CommanderAccess, 'archives'>;

export class ArchivePasswords {
  private passwordAsks = 0;
  private readonly passwordsAsked = new Map<
    number,
    {
      readonly page: Page;
      readonly answer: (password: string | undefined) => void;
    }
  >();

  constructor(private readonly access: ArchivePasswordsAccess) {}

  async passwordGiven(
    page: Page,
    file: string,
    wrong: boolean,
  ): Promise<boolean> {
    const { archives } = this.access;
    if (archives === undefined) {
      return false;
    }
    archives.usePassword(file, undefined);
    this.cancelPasswords(page);
    const ask = ++this.passwordAsks;
    const password = await new Promise<string | undefined>((resolve) => {
      this.passwordsAsked.set(ask, { page, answer: resolve });
      post(page, {
        type: 'askPassword',
        ask,
        name: path.basename(file),
        wrong,
      });
    });
    if (password === undefined) {
      return false;
    }
    archives.usePassword(file, password);
    return true;
  }

  cancelPasswords(of: Page): void {
    for (const [ask, { page, answer }] of this.passwordsAsked) {
      if (page === of || page.disposed) {
        this.passwordsAsked.delete(ask);
        answer(undefined);
      }
    }
  }

  answerPassword(ask: unknown, password: unknown): void {
    if (
      typeof ask !== 'number' ||
      (password !== undefined && typeof password !== 'string')
    ) {
      return;
    }
    const asked = this.passwordsAsked.get(ask);
    if (asked !== undefined) {
      this.passwordsAsked.delete(ask);
      asked.answer(password);
    }
  }
}
