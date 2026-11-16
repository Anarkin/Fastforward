import { plainOf } from '../../lib/shared/sentences';
import type { GitToWebview } from '../../tools/git/shared/protocol';
import type { ToWebview } from '../../shell/shared/protocol';

export type PageMessage =
  Exclude<ToWebview, { readonly type: 'tool' }> | GitToWebview;

export type PageMessageOf<T extends PageMessage['type']> = Extract<
  PageMessage,
  { readonly type: T }
>;

export class FakePage {
  readonly messages: PageMessage[] = [];
  readonly otherTools: Extract<ToWebview, { readonly type: 'tool' }>[] = [];
  readonly listeners = new Set<(message: PageMessage) => void>();
  tabs: PageMessageOf<'tabs'> | undefined;

  receive(sent: ToWebview): void {
    if (sent.type === 'tool' && sent.tool !== 'git') {
      this.otherTools.push(sent);
      return;
    }
    const message = sent.type === 'tool' ? sent.message : sent;
    if (message.type === 'tabs') {
      this.tabs = message;
    }
    this.messages.push(message);
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  last<T extends PageMessage['type']>(type: T): PageMessageOf<T> | undefined {
    return this.messages.findLast(
      (message): message is PageMessageOf<T> => message.type === type,
    );
  }

  clear(): void {
    this.messages.length = 0;
  }
}

export async function withNotices(
  page: FakePage,
  level: 'info' | 'error',
  run: (messages: string[]) => Promise<void>,
): Promise<void> {
  const messages: string[] = [];
  const listener = (message: PageMessage) => {
    if (message.type === 'notice' && message.level === level) {
      messages.push(plainOf(message.message));
    }
  };
  page.listeners.add(listener);
  try {
    await run(messages);
  } finally {
    page.listeners.delete(listener);
  }
}

export function commitsSent(messages: readonly PageMessage[]): number {
  return messages.filter((message) => message.type === 'commits').length;
}

export function workingTreesSent(messages: readonly PageMessage[]): number {
  return messages.filter((message) => message.type === 'workingTree').length;
}
