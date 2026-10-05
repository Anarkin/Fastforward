import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Crash, ErrorBoundary } from '../webview/errorBoundary';
import { renderedBy } from './fixtures';

const noop = () => {};

suite('Error boundary', () => {
  test('shows the window as it is while nothing fails', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary title="Fastforward" onError={noop}>
        <span>window</span>
      </ErrorBoundary>,
    );
    assert.strictEqual(html, '<span>window</span>');
  });

  test('shows a failure to draw the window and a way to reload it, under the title bar to drag the window by', () => {
    const boundary = new ErrorBoundary({
      title: 'Fastforward 1.2.3',
      onError: noop,
      children: null,
    });
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('boom'));
    const html = renderToStaticMarkup(boundary.render());
    assert.match(html, /class="title-bar"/);
    assert.match(html, />Fastforward 1.2.3<\/span>/);
    assert.match(html, /<div class="error-message">[^<]*boom<\/div>/);
    assert.match(html, /<button[^>]*>Reload<\/button>/);
  });

  test('shows what was thrown when it is no error', () => {
    const html = renderToStaticMarkup(
      <Crash title="Fastforward" error="boom" onReload={noop} />,
    );
    assert.match(html, /<div class="error-message">[^<]*boom<\/div>/);
  });

  test('logs the failure with the components it happened in', () => {
    const logged: string[] = [];
    const boundary = new ErrorBoundary({
      title: 'Fastforward',
      onError: (message) => logged.push(message),
      children: null,
    });
    const error = new Error('boom');
    error.stack = 'Error: boom\n    at f (webview.js:1:2)';
    boundary.componentDidCatch(error, { componentStack: '\n    at Diff' });
    assert.deepStrictEqual(logged, [
      'Error: boom\n    at f (webview.js:1:2)\n    at Diff',
    ]);
  });

  test('reloads the window on its button', () => {
    let reloads = 0;
    const crash = renderedBy(Crash, {
      title: 'Fastforward',
      error: new Error('boom'),
      onReload: () => reloads++,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(crash));
    const body = crash.props.children[1];
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(body));
    const button = body.props.children[1];
    assert.ok(isValidElement<{ onClick: () => void }>(button));
    button.props.onClick();
    assert.strictEqual(reloads, 1);
  });
});
