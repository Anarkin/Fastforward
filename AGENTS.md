# AGENTS

- @CONTRIBUTING.md
- @README.md
- @docs/ARCHITECTURE.md
- @docs/FEATURES-GIT.md

## Protected files

- Do not change the following files without approval. If you think an update is necessary or would be beneficial, suggest it and wait for approval:
  - `AGENTS.md`
  - `CODEOWNERS`
  - `CONTRIBUTING.md`
  - `LICENSE`
  - `README.md`

## Tests

- Run the tests in `app/`; the tests of `src/<path>` are in `src/test/<path>`
- While working, run only the test files of what changed, by path: `npx vitest run <files>`; a test written for a fix runs first, and fails
- Before a commit, run `npm run verify:fast && npm run build`, about 40 seconds; for most changes nothing else is needed
- Run a `.git`, `.shells`, `.electron` or packaging test file only when the change is what it tests, by path, never its whole project, in the background while editing, and read its result before committing
  - `.git`: anything in `src/tools/git/main/`, `scripts/release.mts` and `src/main/shellPath.ts`
  - `.electron`: what only the running app shows: the window, the preload, the app's protocol, focus, drag and drop, layout, wrapping and styles, the previews, the syntax worker, settings applied as saved, the terminal, quitting; after `npm run build`
  - `.shells`: how the terminal starts real shells
  - `build`, `ffScripts` and `installer`: `esbuild.config.mts`, `build/`, the `ff` scripts and the Explorer menu
- Tests check the app's sentences word for word: after rewording one in `strings.ts`, search `src/test` for the old text and run the files that have it
- After changing a value or function in a `shared/protocol.ts` or `settings.ts`, run the `.git` and `.electron` files that import it
- Imports don't pick the tests: `strings.ts` and the shared protocols reach nearly every test file, so `vitest related` and `--changed` select almost all of them
- Leave the whole suite to CI, which runs it on Windows, macOS and Linux for every push to `main` and every pull request; run it locally only after changing the test harness, the fixtures, `vitest.config.mts` or `package.json`
- After committing to `main`, push it, never by force, and watch the CI run of the pushed commit in the background
- When CI fails because of one of your commits, read the failed job's log, run what failed locally by path, and fix it in a new commit; a failure only on macOS or Linux may pass here, so fix it from the log
- Reproduce a flaky test with `npx vitest run <file> -t '<name>' --repeats 20`, never by rerunning its project or its CI run
