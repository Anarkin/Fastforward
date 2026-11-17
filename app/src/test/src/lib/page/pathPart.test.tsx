import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { act } from 'react';
import { PathName } from '../../../../lib/page/pathName';
import {
  PathMenuContext,
  type PathMenuAsk,
} from '../../../../lib/page/pathMenu';
import { mounted } from '../../../helpers/mounted';

suite('The parts of a path', () => {
  test('ask for the menu of the folder or file a part is on a right click, by its whole path, its folder joined to it as the platform writes it, never the menu of what holds them', async () => {
    const asked: PathMenuAsk[] = [];
    let held = 0;
    let wentTo = 0;
    await mounted(
      <PathMenuContext value={(ask) => asked.push(ask)}>
        <div
          onContextMenu={() => {
            held += 1;
          }}
        >
          <PathName
            path="src/a.ts"
            file
            root={'C:\\repo'}
            goTo={() => {
              wentTo += 1;
            }}
          />
        </div>
      </PathMenuContext>,
      (main, window) => {
        const [src, file] = main.querySelectorAll('.path-part');
        act(() => {
          src?.dispatchEvent(
            new window.MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              button: 2,
              clientX: 10,
              clientY: 20,
            }),
          );
          file?.dispatchEvent(
            new window.MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              button: 2,
              shiftKey: true,
            }),
          );
        });
      },
    );
    assert.deepStrictEqual(
      asked.map(({ onGoTo, ...ask }) => [ask, onGoTo !== undefined]),
      [
        [
          {
            path: 'C:\\repo\\src',
            file: false,
            at: { x: 10, y: 20 },
            extended: false,
          },
          false,
        ],
        [
          {
            path: 'C:\\repo\\src\\a.ts',
            file: true,
            at: { x: 0, y: 0 },
            extended: true,
          },
          true,
        ],
      ],
    );
    asked[1]?.onGoTo?.();
    assert.deepStrictEqual([held, wentTo], [0, 1]);
  });
});
