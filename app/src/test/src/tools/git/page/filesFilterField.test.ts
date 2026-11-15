import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { suite, test } from 'vitest';
import { FileFilterField } from '../../../../../tools/git/page/filesFilterField';
import { keyPress, noop } from '../../../../helpers/fixtures';

suite('Files search', () => {
  test('searches as one types, goes to the files on Enter or Down, and closes on Esc', () => {
    const queries: string[] = [];
    let left = 0;
    let closed = 0;
    const field = FileFilterField({
      query: 'v',
      onQuery: (next) => queries.push(next),
      onLeave: () => left++,
      onClose: () => closed++,
    });
    assert.ok(
      isValidElement<{
        children: React.ReactElement<{
          onChange: (event: { target: { value: string } }) => void;
          onKeyDown: (
            event: ReturnType<typeof keyPress> & { preventDefault: () => void },
          ) => void;
        }>;
      }>(field),
    );
    const input = field.props.children;
    input.props.onChange({ target: { value: 'vi' } });
    assert.deepStrictEqual(queries, ['vi']);
    for (const key of ['Enter', 'ArrowDown']) {
      input.props.onKeyDown({ ...keyPress(key), preventDefault: noop });
    }
    assert.strictEqual(left, 2);
    input.props.onKeyDown({ ...keyPress('Escape'), preventDefault: noop });
    assert.strictEqual(closed, 1);
    input.props.onKeyDown({ ...keyPress('a'), preventDefault: noop });
    assert.strictEqual(left + closed, 3);
  });
});
