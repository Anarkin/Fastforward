import { commit, pointer } from './gitImport.mts';
import { copies, samples } from './gitHistory.mts';

const longHistory = 50_000;

export function branches(main: number, first: number, large: boolean) {
  const tracked = ['main'];
  const appended = new Map<string, string>();
  const append = (
    ref: string,
    from: number,
    file: string,
    k: number,
    what: string,
  ) => {
    let tip = from;
    let text = appended.get(`${from} ${file}`) ?? '';
    for (let j = 1; j <= k; j++) {
      text += `${what} ${j}\n`;
      tip = commit(ref, {
        from: tip,
        changes: [{ path: file, content: text }],
        message: `${what} (${j} of ${k})`,
      });
      appended.set(`${tip} ${file}`, text);
    }
    return tip;
  };
  const start = (name: string) => {
    const tip = commit(`refs/heads/${name}`, {
      from: main,
      changes: [{ path: `${name}.txt`, content: 'shared\n' }],
      message: `Start ${name}`,
    });
    appended.set(`${tip} ${name}.txt`, 'shared\n');
    pointer(`refs/playground/${name}`, tip);
    tracked.push(name);
    return tip;
  };
  const lagging = (name: string, k: number) =>
    append(
      `refs/playground/${name}`,
      start(name),
      `${name}.txt`,
      k,
      `Add work only the remote has to ${name}`,
    );
  const ahead = (name: string, k: number) =>
    append(
      `refs/heads/${name}`,
      start(name),
      `${name}-mine.txt`,
      k,
      `Add unpushed work to ${name}`,
    );

  for (let k = 1; k <= copies; k++) {
    const t = String(k).padStart(2, '0');
    lagging(`lagging-${t}`, k);
    ahead(`ahead-${t}`, k);
    const diverged = `diverged-${t}`;
    const base = start(diverged);
    append(
      `refs/playground/${diverged}`,
      base,
      `${diverged}.txt`,
      k,
      `Add work only the remote has to ${diverged}`,
    );
    append(
      `refs/heads/${diverged}`,
      base,
      `${diverged}-mine.txt`,
      k,
      `Add unpushed work to ${diverged}`,
    );
    append(
      `refs/heads/local-only-${t}`,
      main,
      `local-only-${t}.txt`,
      k,
      `Add unpushed work to local-only-${t}`,
    );
  }
  lagging('in-worktree', 2);
  ahead('protected-ahead', 1);
  const nested =
    'feature/team/a-very-long-branch-name-that-keeps-going-to-show-how-bubbles-wrap';
  pointer(`refs/heads/${nested}`, main);
  pointer(`refs/playground/${nested}`, main);
  tracked.push(nested);
  pointer('refs/heads/gone-upstream', main);
  pointer('refs/heads/blocked-pull', main);
  commit('refs/playground/blocked-pull', {
    from: main,
    changes: [
      {
        path: 'samples/style.css',
        content: `${samples['samples/style.css'][1]}\n.incoming {\n  color: green;\n}\n`,
      },
    ],
    message:
      'Change the style on the remote, where the working tree changes it too',
  });
  tracked.push('blocked-pull');
  const remoteOnly = [1, 2, 3].map((n) => {
    const name = `remote-only-${n}`;
    commit(`refs/playground/${name}`, {
      from: main,
      changes: [{ path: `${name}.txt`, content: `only on the remote ${n}\n` }],
      message: `Add work only the remote has, on ${name}`,
    });
    return name;
  });
  for (let team = 1; team <= 10; team++) {
    for (let n = 1; n <= 30; n++) {
      pointer(
        `refs/heads/crowd/team-${String(team).padStart(2, '0')}/branch-${String((team - 1) * 30 + n).padStart(3, '0')}`,
        first,
      );
    }
  }
  let odd = main;
  let oddText = '';
  for (const [message, author] of [
    [
      'Explain in one very long subject line everything this commit does, why it does it, what it leaves for later, who asked for it in the first place, and when',
      undefined,
    ],
    [
      'Explain a change in a body\n\nThe subject stays short, and the body says the rest.\n\n- point one\n- point two\n',
      undefined,
    ],
    ['Celebrate the release 🎉🚀', undefined],
    [
      'Commit from far in the future, in an odd time zone',
      'Zoë Ångström 李 <zoe@example.com> 4070908800 +1345',
    ],
    [
      'Commit from long ago, in another odd time zone',
      'Playground <playground@example.com> 86400 -1200',
    ],
  ] as const) {
    oddText += `${message.split('\n')[0]}\n`;
    odd = commit('refs/heads/odd-commits', {
      from: odd,
      changes: [{ path: 'odd-commits.txt', content: oddText }],
      message,
      author,
    });
  }
  for (const [side, content] of [
    ['conflict-ours', 'ours\n'],
    ['conflict-theirs', 'theirs\n'],
    ['rebasing', 'rebasing\n'],
  ]) {
    commit(`refs/heads/${side}`, {
      from: main,
      changes: [{ path: 'conflict.txt', content }],
      message: `Write the ${side} side of a conflict`,
    });
  }
  if (large) {
    let tip = main;
    for (let i = 1; i <= longHistory; i++) {
      tip = commit('refs/heads/long-history', {
        from: tip,
        changes: [{ path: 'long-history.txt', content: `step ${i}\n` }],
        message: `Take step ${i} of a long history`,
      });
    }
  }
  return { tracked, remoteOnly };
}
