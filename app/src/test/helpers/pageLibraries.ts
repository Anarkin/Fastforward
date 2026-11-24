import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const load = createRequire(__filename);

const reactDomClient = /[\\/]react-dom[\\/]cjs[\\/]react-dom-client\./;

const pageGlobals = ['window', 'document'] as const;

function putIn(window: JSDOM['window']): () => void {
  const saved = pageGlobals.map(
    (name) =>
      [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  Object.assign(globalThis, { window, document: window.document });
  return () => {
    for (const [name, described] of saved) {
      if (described === undefined) {
        Reflect.deleteProperty(globalThis, name);
      } else {
        Object.defineProperty(globalThis, name, described);
      }
    }
  };
}

export async function loadPageLibrariesAsInTheApp(): Promise<void> {
  if (Object.keys(load.cache).some((id) => reactDomClient.test(id))) {
    return;
  }
  const { window } = new JSDOM('');
  Object.assign(window, {
    AnimationEvent: class extends window.Event {},
    TransitionEvent: class extends window.Event {},
  });
  const putBack = putIn(window);
  const { poolSize } = Buffer;
  Buffer.poolSize = 0;
  try {
    await import('@xterm/addon-unicode-graphemes');
    await import('dompurify');
    load('react-dom/client');
  } finally {
    Buffer.poolSize = poolSize;
    putBack();
  }
}

export function letGoOfThePointer(): void {
  const { window } = new JSDOM('<main></main>');
  const main = window.document.querySelector('main');
  const client: unknown = load('react-dom/client');
  const createRoot: unknown = Reflect.get(Object(client), 'createRoot');
  if (main === null || typeof createRoot !== 'function') {
    return;
  }
  const putBack = putIn(window);
  try {
    Reflect.apply(createRoot, undefined, [main]);
    main.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
  } finally {
    putBack();
    window.close();
  }
}
