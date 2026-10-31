import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { noop, renderedBy } from '../../fixtures';

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
