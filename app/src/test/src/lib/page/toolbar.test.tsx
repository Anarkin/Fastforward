import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { Toolbar, ToolbarSpace } from '../../../../lib/page/toolbar';

suite('Toolbar', () => {
  test('holds what it is given in one element that is a toolbar, with the classes and the attributes of its own it is given after that', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <Toolbar>
          <button />
          <button />
        </Toolbar>,
      ),
      '<div class="toolbar"><button></button><button></button></div>',
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <Toolbar className="column-start" role="group" aria-label="Layout">
          <Toolbar className="segmented" />
        </Toolbar>,
      ),
      '<div class="toolbar column-start" role="group" aria-label="Layout"><div class="toolbar segmented"></div></div>',
    );
  });

  test('leaves the room of a button between two buttons by a space of its own, which the stylesheet of the buttons sizes', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <Toolbar>
          <button />
          <ToolbarSpace />
          <button />
        </Toolbar>,
      ),
      '<div class="toolbar"><button></button><span class="toolbar-space"></span><button></button></div>',
    );
  });
});
