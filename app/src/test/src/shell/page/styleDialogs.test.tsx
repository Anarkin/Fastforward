import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { createGitStore, GitStore } from '../../../../tools/git/page/store';
import { MenuButton } from '../../../../lib/page/menu';
import { Name } from '../../../../lib/page/name';
import { ConfirmPopup } from '../../../../shell/page/confirmPopup';
import { PromptPopup } from '../../../../shell/page/promptPopup';
import { ClonePopup } from '../../../../tools/git/page/clonePopup';
import { cascaded } from '../../../helpers/cascade';
import { noop, looks } from './stylesheetFixtures';
import { allWithClass, rendered, withClass } from '../../../helpers/markup';

suite('Style', () => {
  test('draws the button of a dialog the keyboard moved the focus to as the tool chooser draws its tool, tinted inside the outline of focus, the default button then plain, as Enter presses the one focused', () => {
    const row = rendered(
      <div className="confirm-buttons">
        <button className="confirm-button">Cancel</button>
        <button className="confirm-button default">OK</button>
      </div>,
    );
    const [cancel, ok] = allWithClass(row, 'confirm-button');
    const tool = rendered(<button className="open-with-tool">Terminal</button>);
    const asTool = {
      color: 'inherit',
      background: cascaded(tool, 'background', { focus: tool }),
      outline: cascaded(tool, 'outline', { focus: tool }),
      'outline-offset': cascaded(tool, 'outline-offset', { focus: tool }),
    };
    assert.strictEqual(asTool.background, 'var(--selection-background)');
    looks(ok, {
      color: 'var(--color-focus-foreground)',
      background: 'var(--color-focus)',
    });
    looks(cancel, { background: 'var(--color-background)' });
    looks(cancel, asTool, { focus: cancel });
    looks(
      ok,
      { color: 'inherit', background: 'var(--color-background)' },
      { focus: cancel },
    );
    looks(ok, asTool, { focus: ok });
  });

  test('paints the default button of a confirmation in the color of focus, hovered or not, so it shows what Enter does', () => {
    const popup = rendered(
      <ConfirmPopup
        title="Close Tab"
        message="Are you sure?"
        confirm="Close"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const blue = {
      color: 'var(--color-focus-foreground)',
      background: 'var(--color-focus)',
    };
    looks(withClass(popup, 'confirm-button', 'default'), blue);
    looks(withClass(popup, 'confirm-button', 'default'), blue, {
      hover: withClass(popup, 'confirm-button', 'default'),
    });
  });

  test('writes the names, paths and addresses typed into a dialog in the monospace font of the settings, so every character tells apart, a space at the end, l from I and 0 from O', () => {
    const store = createGitStore(noop, {
      clone: {
        view: { kind: 'form', url: '', folder: '/code', name: '' },
        form: 1,
        folder: undefined,
        target: undefined,
      },
    });
    const clone = rendered(
      <GitStore value={store}>
        <ClonePopup />
      </GitStore>,
    );
    const prompt = rendered(
      <PromptPopup
        title="New Folder"
        message="Make a folder"
        label="Name"
        confirm="Make"
        problemOf={() => undefined}
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const fields = [
      withClass(prompt, 'prompt-input'),
      ...allWithClass(clone, 'clone-input'),
    ];
    assert.strictEqual(fields.length, 4);
    for (const field of fields) {
      looks(field, {
        'font-family': 'var(--monospace-font-family)',
        'font-size': 'var(--monospace-font-size)',
      });
    }
  });

  test('sets a name apart in a dialog in the monospace font of the settings on a faint tint of the text, the same on a line of its own as in a sentence, each piece of a path kept whole on a line unless it alone is wider, and the labels of the lines muted', () => {
    const popup = rendered(
      <ConfirmPopup
        title="Copy"
        lines={[
          { label: 'Copy', text: '3 items' },
          { label: 'To', name: 'D:\\photos' },
        ]}
        confirm="Copy"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const name = withClass(popup, 'name');
    looks(name, {
      'font-family': 'var(--monospace-font-family)',
      'font-size': 'var(--monospace-font-size)',
      background: 'var(--name-background)',
      'box-decoration-break': 'clone',
    });
    for (const piece of name.children) {
      looks(piece, {
        display: 'inline-block',
        'max-width': '100%',
        'overflow-wrap': 'anywhere',
      });
    }
    looks(withClass(popup, 'name-lines'), {
      display: 'grid',
      'grid-template-columns': 'auto minmax(0, 1fr)',
    });
    looks(withClass(popup, 'name-label'), {
      color: 'var(--muted-foreground)',
    });
  });

  test('lines the check boxes of a dialog up with its labels, without the margin the browser gives them', () => {
    for (const className of ['pack-check', 'transfer-all']) {
      const label = rendered(
        <label className={className}>
          <input type="checkbox" />
        </label>,
      );
      const [box] = label.children;
      looks(box, { margin: '0' });
    }
  });

  test('sets a name on a button apart only in the monospace font, as the button frames it as its tint would', () => {
    const name = withClass(
      rendered(<MenuButton title="Drive" label="C:" named items={[]} />),
      'name',
    );
    looks(name, {
      'font-family': 'var(--monospace-font-family)',
      background: 'none',
      padding: '0',
    });
  });

  test('keeps the spaces of a name that follow a separator, which a piece of a path kept whole would drop at its start, as in the characters a name cannot hold', () => {
    const name = withClass(rendered(<Name>{'\\ / : * ?'}</Name>), 'name');
    assert.strictEqual(name.children.length, 3);
    for (const piece of name.children) {
      looks(piece, { 'white-space': 'pre-wrap' });
    }
  });
});
