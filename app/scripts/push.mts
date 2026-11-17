import { execFileSync } from 'node:child_process';
import {
  failureOfPush,
  ghCli,
  runOfPush,
  watchRunToFirstFailure,
} from './ciRun.mts';

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim();

if (git('branch', '--show-current') !== 'main') {
  console.error('Switch to the main branch before pushing.');
  process.exit(1);
}

const commit = git('rev-parse', 'HEAD');

try {
  execFileSync('git', ['push', 'origin', `${commit}:refs/heads/main`], {
    stdio: 'inherit',
  });
} catch {
  console.error(
    `Pushing ${commit} failed, as git says above. If the remote has commits this branch lacks, pull them and push again; never force a push.`,
  );
  process.exit(1);
}

const watched = await watchRunToFirstFailure(ghCli, () =>
  runOfPush(ghCli, commit),
);
switch (watched.ended) {
  case 'passed':
    console.log(`CI passed for ${commit}: ${watched.run.url}`);
    process.exit(0);
  case 'failed':
    console.error(failureOfPush(commit, watched.run, watched.failedJobs));
    process.exit(1);
  case 'unwatched':
    console.error(
      `Pushed ${commit}, but could not watch its CI run, as ${watched.why}: ${watched.said}\nCheck the run with gh run list --commit ${commit} --workflow ci.yml.`,
    );
    process.exit(2);
  case 'missing':
    console.error(
      `Pushed ${commit}, but no CI run started for it within 2 minutes. Look for it with gh run list --workflow ci.yml.`,
    );
    process.exit(2);
  case 'unfinished':
    console.error(
      `CI for ${commit} has not finished within an hour: ${watched.run.url}\nCheck it later with gh run view ${watched.run.databaseId} --exit-status.`,
    );
    process.exit(2);
}
