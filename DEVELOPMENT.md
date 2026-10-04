# DEVELOPMENT

- Run `npm install` in `app/`

- Run `npm start` in `app/` to build and open the app, or `npm run dev` to rebuild on every change, which restarts the app after main process changes and reloads the page after the rest; both keep their settings, state and logs in a `Fastforward Dev` folder next to the installed app's, so they run beside it

- Run `npm run dist` in `app/` to build an installer for the current OS into `app/release/`

- Run `npm run release` in `app/` to bump the major version, commit, tag and push it, which builds the installers into a draft GitHub release; pass `-- minor`, `-- patch` or an exact version for another bump

- When debugging a reported problem, read `Fastforward.log`, and `Fastforward.previous.log` for the run before, in the app's logs folder: `%APPDATA%\Fastforward\logs` on Windows, `~/Library/Logs/Fastforward` on macOS and `~/.config/Fastforward/logs` on Linux; Ctrl+Shift+I, or Cmd+Shift+I on macOS, opens the developer tools

- `npm run verify:fast` leaves out the tests that need git repositories, which are named `*.git.test.ts`, and the ones that start the app, which are named `*.electron.test.ts`

- `npm run verify` runs the full test suite
