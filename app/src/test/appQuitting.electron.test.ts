import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication } from 'playwright-core';
import { suite, test } from 'vitest';
import { strings } from '../shared/strings';
import { closeOrKill, launchApp, savedTabs } from './appFixtures';
import { defaultSettings, waitFor } from './fixtures';
import { removeFolder, tempFolder, tempRepository } from './repositories';

async function quitWithoutChromium(
  app: ElectronApplication,
  folder: string,
): Promise<void> {
  const quit = path.join(folder, 'quit');
  await app.evaluate(({ app: electronApp }, marker) => {
    electronApp.once('quit', () =>
      process.getBuiltinModule('node:fs').writeFileSync(marker, ''),
    );
    electronApp.quit();
  }, quit);
  await waitFor(() => fs.existsSync(quit), 'the app to quit');
}

function holdsStartLock(profile: string): boolean {
  return ['lockfile', 'SingletonLock'].some(
    (name) =>
      fs.lstatSync(path.join(profile, name), { throwIfNoEntry: false }) !==
      undefined,
  );
}

suite('App quitting', () => {
  test("stops the git it still runs, which would outlive it, by the end of its own quitting rather than Chromium's, which takes tens of seconds to end its processes on a busy machine", async () => {
    const folder = tempFolder('quitting');
    const profile = path.join(folder, 'profile');
    const alive = path.join(folder, 'alive').replaceAll('\\', '/');
    const stop = path.join(folder, 'stop').replaceAll('\\', '/');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first');
    await repository.git('remote', 'add', 'origin', 'ssh://stalled.invalid/x');
    await repository.git(
      'config',
      'core.sshCommand',
      `i=0; while [ ! -e '${stop}' ]; do i=$((i + 1)); echo $i > '${alive}'; sleep 0.2; done; false`,
    );
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify(savedTabs([repository.root], repository.root)),
    );
    const app = await launchApp(profile);
    try {
      const page = await app.firstWindow();
      await page.locator('.commit', { hasText: 'first' }).waitFor();
      await page.getByTitle(strings.navigation.fetch, { exact: true }).click();
      await waitFor(() => fs.existsSync(alive), 'git to fetch');
      await quitWithoutChromium(app, folder);
      const counted = fs.readFileSync(alive, 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.strictEqual(fs.readFileSync(alive, 'utf8'), counted);
    } finally {
      fs.writeFileSync(stop, '');
      await closeOrKill(app);
      removeFolder(folder);
    }
  });

  test("stops a round of background fetches, starting no other fetch and not saying the one it stopped failed, by the end of its own quitting rather than Chromium's", async () => {
    const folder = tempFolder('quitting-round');
    const profile = path.join(folder, 'profile');
    const stop = path.join(folder, 'stop').replaceAll('\\', '/');
    const alive = (name: string) =>
      path.join(folder, `${name}-alive`).replaceAll('\\', '/');
    const roots: string[] = [];
    for (const name of ['first', 'second']) {
      const repository = await tempRepository(path.join(folder, name));
      await repository.commit(name);
      await repository.git(
        'remote',
        'add',
        'origin',
        'ssh://stalled.invalid/x',
      );
      await repository.git(
        'config',
        'core.sshCommand',
        `while [ ! -e '${stop}' ]; do echo > '${alive(name)}'; sleep 0.2; done; false`,
      );
      roots.push(repository.root);
    }
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify(savedTabs(roots, roots[0])),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ tools: { git: { autoFetch: false } } }),
    );
    const app = await launchApp(profile);
    try {
      const page = await app.firstWindow();
      await page.locator('.commit', { hasText: 'first' }).waitFor();
      await page
        .getByTitle(
          strings.navigation.fetchEvery(
            defaultSettings().tools.git.autoFetchMinutes,
          ),
        )
        .click();
      await waitFor(() => fs.existsSync(alive('first')), 'git to fetch');
      await quitWithoutChromium(app, folder);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.ok(!fs.existsSync(alive('second')));
      assert.doesNotMatch(
        fs.readFileSync(path.join(profile, 'logs', 'Fastforward.log'), 'utf8'),
        new RegExp(strings.log.fetchFailed),
      );
    } finally {
      fs.writeFileSync(stop, '');
      await closeOrKill(app);
      removeFolder(folder);
    }
  });

  test('starts again while it waits for a checkout to end as it quits', async () => {
    const folder = tempFolder('quitting-checkout');
    const profile = path.join(folder, 'profile');
    const hooks = path.join(folder, 'hooks');
    const alive = path.join(folder, 'alive').replaceAll('\\', '/');
    const stop = path.join(folder, 'stop').replaceAll('\\', '/');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first');
    await repository.commit('second');
    await repository.git('branch', 'other', 'HEAD~1');
    fs.mkdirSync(hooks);
    fs.writeFileSync(
      path.join(hooks, 'post-checkout'),
      `#!/bin/sh\nwhile [ ! -e '${stop}' ]; do echo > '${alive}'; sleep 0.2; done\n`,
      { mode: 0o755 },
    );
    await repository.git('config', 'core.hooksPath', hooks);
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify(savedTabs([repository.root], repository.root)),
    );
    const app = await launchApp(profile);
    let again: ElectronApplication | undefined;
    try {
      const page = await app.firstWindow();
      await page
        .locator('.commit .badge.branch', { hasText: 'other' })
        .click({ button: 'right' });
      await page
        .locator('.context-menu .menu-item', {
          hasText: strings.commits.checkout,
        })
        .click();
      await waitFor(() => fs.existsSync(alive), 'the checkout to run');
      assert.ok(holdsStartLock(profile));
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await waitFor(
        () => !holdsStartLock(profile),
        'the app to let another start',
      );
      again = await launchApp(profile);
      const shown = await again.firstWindow();
      await shown.locator('.commit', { hasText: 'second' }).waitFor();
    } finally {
      fs.writeFileSync(stop, '');
      if (again) {
        await closeOrKill(again);
      }
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});
