import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { suite, test } from 'vitest';
import {
  ClonePopup,
  formProblem,
  type ChosenFolder,
  type CloneTarget,
} from '../../../../tools/git/page/clonePopup';
import type { CloneAsk, CloneView } from '../../../../tools/git/shared/clone';
import { strings } from '../../../../shared/strings';

interface Shown {
  readonly dom: JSDOM;
  readonly root: Root;
  readonly cloned: CloneAsk[];
  readonly checked: string[];
  readonly asked: string[];
}

interface Props {
  readonly view: CloneView;
  readonly formKey?: number;
  readonly chosenFolder?: ChosenFolder;
  readonly target?: CloneTarget;
}

async function withPopup(
  props: Props,
  run: (shown: Shown, show: (props: Props) => Promise<void>) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>');
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  try {
    const { createRoot } = await import('react-dom/client');
    const main = dom.window.document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    const shown: Shown = { dom, root, cloned: [], checked: [], asked: [] };
    const show = async (next: Props) => {
      await act(async () => {
        root.render(
          <ClonePopup
            view={next.view}
            formKey={next.formKey ?? 1}
            chosenFolder={next.chosenFolder}
            checked={next.target}
            onCheck={(folder, name) => shown.checked.push(`${folder} ${name}`)}
            onChooseFolder={(from) => shown.asked.push(`choose ${from}`)}
            onClone={(ask) => shown.cloned.push(ask)}
            onStop={() => shown.asked.push('stop')}
            onClose={() => shown.asked.push('close')}
          />,
        );
      });
    };
    await show(props);
    try {
      await run(shown, show);
    } finally {
      await act(async () => root.unmount());
    }
  } finally {
    Object.assign(globalThis, saved);
  }
}

function inputs(dom: JSDOM): HTMLInputElement[] {
  return [...dom.window.document.querySelectorAll('input')];
}

async function type(
  dom: JSDOM,
  input: HTMLInputElement,
  value: string,
): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    )?.set?.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

async function submit(dom: JSDOM): Promise<void> {
  await act(async () => {
    dom.window.document
      .querySelector('form')
      ?.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      );
  });
}

function text(dom: JSDOM, selector: string): string | undefined {
  return dom.window.document.querySelector(selector)?.textContent ?? undefined;
}

function cloneButton(dom: JSDOM): HTMLButtonElement | undefined {
  return [...dom.window.document.querySelectorAll('button')].find(
    (button) => button.textContent === strings.clone.clone,
  );
}

const form: CloneView = {
  kind: 'form',
  url: 'git@github.com:Anarkin/Fastforward.git',
  folder: '/code',
  name: '',
};

suite('Clone popup', () => {
  test('focuses the URL, names the folder after it unless named otherwise, shows where it clones, has the folder checked, and clones on Enter', async () => {
    await withPopup({ view: form }, async ({ dom, cloned, checked }) => {
      const [url, folder, name] = inputs(dom);
      assert.strictEqual(dom.window.document.activeElement, url);
      assert.strictEqual(folder.value, '/code');
      assert.strictEqual(name.placeholder, 'Fastforward');
      assert.strictEqual(
        text(dom, '.clone-target'),
        'Clones into /code/Fastforward',
      );
      assert.deepStrictEqual(checked, ['/code Fastforward']);
      await submit(dom);
      assert.deepStrictEqual(cloned, [
        { url: form.url, folder: '/code', name: 'Fastforward' },
      ]);
      await type(dom, name, 'ff');
      assert.strictEqual(text(dom, '.clone-target'), 'Clones into /code/ff');
      assert.deepStrictEqual(checked.at(-1), '/code ff');
      await submit(dom);
      assert.deepStrictEqual(cloned.at(-1), {
        url: form.url,
        folder: '/code',
        name: 'ff',
      });
    });
  });

  test("shows no folder to clone into for a name a folder can't have", async () => {
    await withPopup({ view: { ...form, name: '..' } }, async ({ dom }) => {
      assert.strictEqual(text(dom, '.clone-target'), undefined);
      assert.strictEqual(
        text(dom, '.clone-problem'),
        ".. can't be the name of a folder",
      );
    });
  });

  test('clones nothing until a URL is given, saying nothing of it', async () => {
    await withPopup({ view: { ...form, url: '' } }, async ({ dom, cloned }) => {
      assert.strictEqual(cloneButton(dom)?.disabled, true);
      assert.strictEqual(text(dom, '.clone-problem'), undefined);
      await submit(dom);
      assert.deepStrictEqual(cloned, []);
      await type(dom, inputs(dom)[0], 'https://example.com/app.git');
      assert.strictEqual(cloneButton(dom)?.disabled, false);
    });
  });

  test('says what the main process found wrong with the folder and name in it, keeping Clone disabled', async () => {
    const target = {
      folder: '/code',
      name: 'Fastforward',
      problem: '/code/Fastforward already exists',
    };
    await withPopup({ view: form, target }, async ({ dom, cloned }) => {
      assert.strictEqual(text(dom, '.clone-problem'), target.problem);
      assert.strictEqual(cloneButton(dom)?.disabled, true);
      await submit(dom);
      assert.deepStrictEqual(cloned, []);
      await type(dom, inputs(dom)[2], 'other');
      assert.strictEqual(text(dom, '.clone-problem'), undefined);
      assert.strictEqual(cloneButton(dom)?.disabled, false);
    });
  });

  test('shows why the last clone failed until the form is changed', async () => {
    await withPopup(
      { view: { ...form, name: 'ff', message: 'fatal: no access' } },
      async ({ dom }) => {
        assert.strictEqual(text(dom, '.clone-problem'), 'fatal: no access');
        assert.strictEqual(cloneButton(dom)?.disabled, false);
        await type(dom, inputs(dom)[2], 'fff');
        assert.strictEqual(text(dom, '.clone-problem'), undefined);
      },
    );
  });

  test('asks for the folder from the one in the field, taking each one chosen, and starts over from a new form', async () => {
    await withPopup({ view: form }, async ({ dom, asked }, show) => {
      const button = [...dom.window.document.querySelectorAll('button')].find(
        (each) => each.textContent === strings.tabs.browse,
      );
      await act(async () => button?.click());
      assert.deepStrictEqual(asked, ['choose /code']);
      await show({ view: form, chosenFolder: { folder: '/picked' } });
      assert.strictEqual(inputs(dom)[1].value, '/picked');
      await type(dom, inputs(dom)[1], '/typed');
      await show({ view: form, chosenFolder: { folder: '/picked' } });
      assert.strictEqual(inputs(dom)[1].value, '/picked');
      await show({ view: { ...form, folder: '/next' }, formKey: 2 });
      assert.strictEqual(inputs(dom)[1].value, '/next');
    });
  });

  test('shows how far a running clone got, with Stop focused, closing on its close button', async () => {
    await withPopup(
      {
        view: {
          kind: 'running',
          url: form.url,
          target: '/code/Fastforward',
          progress: {
            phase: 'Receiving objects',
            percent: 45,
            detail: '1.20 MiB | 600.00 KiB/s',
          },
        },
      },
      async ({ dom, asked }) => {
        assert.strictEqual(
          text(dom, '.clone-running'),
          `Cloning ${form.url}into /code/Fastforward`,
        );
        assert.strictEqual(text(dom, '.clone-phase'), 'Receiving objects');
        assert.strictEqual(text(dom, '.clone-percent'), '45%');
        assert.strictEqual(
          dom.window.document
            .querySelector('[role="progressbar"]')
            ?.getAttribute('aria-valuenow'),
          '45',
        );
        assert.strictEqual(
          text(dom, '.clone-detail'),
          '1.20 MiB | 600.00 KiB/s',
        );
        const stop = dom.window.document.activeElement;
        assert.ok(stop instanceof dom.window.HTMLButtonElement);
        assert.strictEqual(stop.textContent, strings.clone.stop);
        await act(async () => stop.click());
        await act(async () =>
          dom.window.document
            .querySelector<HTMLButtonElement>(
              `button[title="${strings.common.close}"]`,
            )
            ?.click(),
        );
        assert.deepStrictEqual(asked, ['stop', 'close']);
      },
    );
  });

  test('says it is connecting until git tells how far it got', async () => {
    await withPopup(
      {
        view: { kind: 'running', url: form.url, target: '/code/Fastforward' },
      },
      async ({ dom }) => {
        assert.strictEqual(text(dom, '.clone-phase'), 'Connecting');
        assert.strictEqual(text(dom, '.clone-percent'), '');
      },
    );
  });
});

suite('Clone form problem', () => {
  test('tells the problem of the URL, then the name, then the one found for this folder and name only', () => {
    const target = { folder: '/code', name: 'app', problem: 'taken' };
    assert.strictEqual(formProblem('', '/code', '..', target), undefined);
    assert.strictEqual(
      formProblem('-x', '/code', '..', target),
      "The URL can't start with -",
    );
    assert.strictEqual(
      formProblem('git@host:app', '/code', '..', target),
      ".. can't be the name of a folder",
    );
    assert.strictEqual(
      formProblem('git@host:app', '/code', 'app', target),
      'taken',
    );
    assert.strictEqual(
      formProblem('git@host:app', '/other', 'app', target),
      undefined,
    );
    assert.strictEqual(
      formProblem('git@host:app', '/code', 'app', undefined),
      undefined,
    );
  });
});
