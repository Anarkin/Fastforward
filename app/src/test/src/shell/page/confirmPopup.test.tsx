import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { ConfirmPopup } from '../../../../shell/page/confirmPopup';
import { noop, renderedBy } from '../../../helpers/fixtures';

function buttonsIn(node: unknown): { onClick: () => void }[] {
  if (Array.isArray(node)) {
    return node.flatMap(buttonsIn);
  }
  if (!isValidElement<{ children?: unknown; onClick?: () => void }>(node)) {
    return [];
  }
  const own = node.props.onClick ? [{ onClick: node.props.onClick }] : [];
  return [...own, ...buttonsIn(node.props.children)];
}

const asked = {
  title: 'Close Tab',
  message: 'Are you sure you want to close repo?',
  confirm: 'Close',
};

suite('Confirm popup', () => {
  test('asks its question in a dialog under its title, offering to cancel before to confirm', () => {
    const html = renderToStaticMarkup(
      <ConfirmPopup {...asked} onConfirm={noop} onCancel={noop} />,
    );
    assert.match(html, /role="dialog"/);
    assert.match(html, />Close Tab</);
    assert.match(html, />Are you sure you want to close repo\?</);
    assert.ok(
      html.indexOf('>Cancel</button>') < html.lastIndexOf('>Close</button>'),
    );
  });

  test('names what it asks about on lines of their own after its question, rather than in quotes inside it, and says what more there is to know after them', () => {
    const html = renderToStaticMarkup(
      <ConfirmPopup
        title="Delete Permanently"
        message="Delete from the archive permanently? This cannot be undone."
        lines={[
          { label: 'Item', name: 'a.txt' },
          { label: 'Archive', name: 'photos.zip' },
        ]}
        note="It is there already."
        confirm="Delete Permanently"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    assert.match(
      html,
      /<div class="confirm-question"><span>Delete from the archive permanently\? This cannot be undone\.<\/span><div class="name-lines"><span class="name-label">Item<\/span><span class="name-value"><code class="name"><span>a\.txt<\/span><\/code><\/span><span class="name-label">Archive<\/span><span class="name-value"><code class="name"><span>photos\.zip<\/span><\/code><\/span><\/div><span>It is there already\.<\/span><\/div>/,
    );
  });

  test('asks on its lines alone when they say it all, and draws no lines when it has none', () => {
    const lines = renderToStaticMarkup(
      <ConfirmPopup
        title="Copy"
        lines={[
          { label: 'Copy', name: 'a.txt' },
          { label: 'To', name: 'D:\\photos' },
        ]}
        confirm="Copy"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    assert.match(
      lines,
      /<div class="confirm-question"><div class="name-lines">/,
    );
    const none = renderToStaticMarkup(
      <ConfirmPopup {...asked} lines={[]} onConfirm={noop} onCancel={noop} />,
    );
    assert.doesNotMatch(none, /name-lines/);
  });

  test('tells without asking when there is nothing to cancel, offering its one button', () => {
    const html = renderToStaticMarkup(
      <ConfirmPopup
        title="No Access"
        message="You don't have access to C:\Config.Msi."
        confirm="OK"
        cancel={null}
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    assert.deepStrictEqual(
      [
        ...html.matchAll(/<button class="confirm-button[^"]*"[^>]*>([^<]*)</g),
      ].map((match) => match[1]),
      ['OK'],
    );
  });

  test('offers another way on, before its default button, running only its own action', () => {
    const log: string[] = [];
    const props = {
      title: 'No Access',
      message: 'No access.',
      confirm: 'OK',
      cancel: null,
      onConfirm: () => log.push('ok'),
      onCancel: () => log.push('cancel'),
      extra: { label: 'As Administrator', onClick: () => log.push('admin') },
    };
    const html = renderToStaticMarkup(<ConfirmPopup {...props} />);
    assert.deepStrictEqual(
      [
        ...html.matchAll(/<button class="confirm-button[^"]*"[^>]*>([^<]*)</g),
      ].map((match) => match[1]),
      ['As Administrator', 'OK'],
    );
    const buttons = buttonsIn(renderedBy(ConfirmPopup, props));
    buttons.at(-2)?.onClick();
    assert.deepStrictEqual(log, ['admin']);
  });

  test('makes confirming its default, the button Enter presses, and no other', () => {
    const html = renderToStaticMarkup(
      <ConfirmPopup {...asked} onConfirm={noop} onCancel={noop} />,
    );
    assert.match(html, /class="confirm-button default"[^>]*>Close<\/button>/);
    assert.match(html, /class="confirm-button"[^>]*>Cancel<\/button>/);
  });

  test('cancels on Cancel and on its close button, and confirms on its own', () => {
    const done: string[] = [];
    const popup = renderedBy(ConfirmPopup, {
      ...asked,
      onConfirm: () => done.push('confirmed'),
      onCancel: () => done.push('cancelled'),
    });
    for (const button of buttonsIn(popup)) {
      button.onClick();
    }
    assert.deepStrictEqual(done.toSorted(), [
      'cancelled',
      'cancelled',
      'confirmed',
    ]);
  });
});
