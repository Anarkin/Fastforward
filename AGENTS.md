# AGENTS

- @CONTRIBUTING.md
- @README.md
- @docs/ARCHITECTURE.md
- @docs/FEATURES-COMMANDER.md
- @docs/FEATURES-DIFF.md
- @docs/FEATURES-EDITOR.md
- @docs/FEATURES-GIT.md
- @docs/FEATURES-TERMINAL.md
- @docs/FEATURES-VIEWER.md
- @docs/PERFORMANCE.md

## Protected files

- Do not change the following files without approval. If you think an update is necessary or would be beneficial, suggest it and wait for approval:
  - `AGENTS.md`
  - `CODEOWNERS`
  - `CONTRIBUTING.md`
  - `LICENSE`
  - `README.md`

## Tests

- Run the tests in `app/`; the tests of `src/<path>` are in `src/test/src/<path>`, and those of `scripts/<path>` in `src/test/scripts/<path>`
- While working, run only the test files of what changed, by path: `npx vitest run <files>`; a test written for a fix runs first, and fails
- Commit only once the checks pass, about 70 seconds, chaining the commit to them from the repo root, naming only your own files: `npm --prefix app run verify:fast && npm --prefix app run build && git add <paths> && git commit -m '<message>' -- <paths>`, never through a pipe such as `tail`, `grep`, `head` or `Select-Object`, as a pipe ends with the code of its last command and hides a failure, and their output is short as it is; for most changes nothing else is needed
- A test file is named for the real program it starts, `.git`, `.7zip`, `.shells`, or `.electron` and `.perf` for the built app, which puts it in a project of its own with longer timeouts, left out of `verify:fast`; the unit tests fake these programs; a test that starts one its name doesn't claim, or a file that never starts the one it claims, fails, saying so; a module tested both ways has a file of each, as `run.test.ts` and `run.git.test.ts`
- Run a `.git`, `.shells`, `.electron`, `.7zip` or packaging test file only when the change is what it tests, by path, never its whole project; while working on one of its tests, run only that test with `-t '<a distinctive part of its name, without + ? ( ) . *>'`, checking it reports 1 passed rather than all skipped, and the whole file once before committing, as its tests may depend on the ones before them
  - `.git`: what runs the installed git: most of `src/tools/git/main/`, `src/tools/editor/main/gitEnding.ts`, `scripts/release.mts`, `scripts/push.mts`, the repositories of `src/test/helpers` and the playgrounds of `scripts/playground/`, which `npm test` leaves to a project of their own
  - `.electron`: what only the running app shows: the window, the preload, the app's protocol, focus, drag and drop, layout, wrapping and styles, the previews, the syntax worker, settings applied as saved, the terminal, quitting; after `npm run build`
  - `.shells`: what starts real shells: the terminal's shells and the login shell `src/boot/shellPath.ts` reads the environment from
  - `.7zip`: anything that runs 7-Zip: the `sevenZip*.ts` modules of `src/tools/commander/main/` and the archives of the playground; after `npm run build`, which fetches it
  - packaging, every test of `src/test/build/`: `esbuild.config.mts`, `build/`, the `ff` scripts and the Explorer menu
- Tests check the app's sentences word for word: after rewording one in `strings.ts`, search `src/test` for the old text and run the files that have it
- Imports don't pick the tests: `strings.ts` and the shared protocols reach nearly every test file, so `vitest related` and `--changed` select almost all of them
- Leave the whole suite to CI, which runs it on Windows, macOS and Linux for every push to `main` and every pull request, never locally: after changing the test harness or `vitest.config.mts`, run one file of each project it reaches, and after changing a fixture, the files that use it
- After adding, splitting or slowing down end-to-end files, run `npm --prefix app run durations` once CI of `main` has passed, and commit `src/test/durations.json`, which CI balances its shards by
- After committing to `main`, run `npm --prefix app run push` in the background, never through a pipe; it pushes without force, then watches the CI run of the pushed commit, exiting with 1 when the push fails or as soon as a job of the run has failed, naming the job and the command that reads its log while the other jobs still run, and 2 when it pushed but could not watch CI; when it says a job never got a machine from GitHub, no commit caused it: run the job again as it says, once the run has ended
- When CI fails because of one of your commits, read the failed job's log, run what failed locally by path, and fix it in a new commit; a failure only on macOS or Linux may pass here, so fix it from the log
- Reproduce a flaky test with `npx vitest run <file> -t '<name>' --repeats 20`, or an end-to-end one, whose file starts the app once, by running its file again and again, never by rerunning its project or its CI run; one that fails only in CI, or on a system not at hand, with `gh workflow run stress.yml --ref <branch> -f os=<ubuntu-latest, macos-latest or windows-latest> -f files=<files> -f times=<count>`, which runs the files that many times on that system, from a branch pushed for it and deleted after

### Lessons from past mistakes

- Those a test can check are the tests of `app/src/test/lessons.test.ts`: add a lesson there rather than here when a test can check it
- Change the settings of a running app with `writeSettings`, never by waiting for its page to load again
- Write over a file the app watches with `writeOver` or `writeWhenFree`, never by emptying it first
- Press a key only once what handles it has the focus
- Take what a page shows for settled with `untilSettled`, never after a sleep or two reads alike
- Start no installed program a test doesn't need, as `gh`, whose first start took 9 seconds in CI
- Rely on no window width, frame rate or speed of the machine
- Reproduce a flaky test before fixing it: a first guess at its cause was wrong twice
