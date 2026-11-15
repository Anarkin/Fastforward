import type { Sentence } from '../../../../lib/shared/sentences';
import type { Log } from '../../../../shell/main/log';
import { tabsKey, windowsKey } from '../../../../shell/main/storage';
import { attach, openView } from '../../../helpers/harness';
import { FakeHost } from '../../../helpers/fakeHost';
import { type FakePage } from '../../../helpers/fakePage';

export const saying = (note?: string) => ({ quitNote: () => note });

export function noticesOf(page: FakePage): (readonly [string, Sentence])[] {
  return page.messages.flatMap((message) =>
    message.type === 'notice'
      ? [[message.level, message.message] as const]
      : [],
  );
}

const commanderTab = (id: string) => ({ id, tool: 'commander' }) as const;

export const shownIn = (page: FakePage) => [
  page.tabs?.tabs.map((tab) => tab.id),
  page.tabs?.active,
];

export async function twoWindows(
  log: Log,
  noGit: string,
  host = new FakeHost(),
) {
  const first = await openView(log, [], false, host, undefined, noGit);
  await first.store.update(
    tabsKey,
    ['1', '5', '2', '3', '4'].map(commanderTab),
  );
  await first.store.update(windowsKey, [
    { id: '1', tabs: ['1', '5'], active: '1' },
    { id: '2', tabs: ['2', '3', '4'], active: '4' },
  ]);
  const second = attach(first.view, '2');
  await first.connection.receive({ type: 'ready' });
  await second.connection.receive({ type: 'ready' });
  return { first, second };
}
