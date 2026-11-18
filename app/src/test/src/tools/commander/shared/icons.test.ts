import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  iconRoute,
  iconTicketOf,
  iconUrl,
  paneFileOf,
} from '../../../../../tools/commander/shared/icons';

suite('Addresses of icons', () => {
  test('writes the tab, the side, the folder, the name and the ticket of an icon into its address so each is read back as it was, whatever characters it holds, half of a pair of surrogates read back as the mark of a character that cannot be written', () => {
    const source = {
      tab: 'tab 1&2',
      side: 'right',
      folder: 'C:\\Work & play\\100% #1\\a+b=c?',
      name: "Årsrapport «final» ~(1)!'*.tar.gz",
    } as const;
    const ticket = ':r1:/«r2» +&=';
    const url = new URL(`fastforward://app${iconUrl(source, ticket)}`);

    assert.strictEqual(url.pathname, iconRoute);
    assert.deepStrictEqual(paneFileOf(url, iconRoute), source);
    assert.strictEqual(iconTicketOf(url), ticket);
    assert.strictEqual(
      iconTicketOf(new URL(`fastforward://app${iconUrl(source)}`)),
      undefined,
    );
    assert.strictEqual(
      paneFileOf(
        new URL(
          `fastforward://app${iconUrl({ ...source, name: 'half\ud83d.txt' })}`,
        ),
        iconRoute,
      )?.name,
      'half\ufffd.txt',
    );
  });
});
