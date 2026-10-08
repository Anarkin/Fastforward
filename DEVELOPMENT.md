# DEVELOPMENT

- Run the npm commands in `app/`, starting with `npm install`

- `npm start` builds and opens the app, and `npm run dev` rebuilds on every change, restarting the app after main process changes and reloading the page after webview ones; both keep their settings, state and logs in a separate `Fastforward Dev` profile, so they run beside the installed app

- `npm run verify` runs every check and test, and `npm run verify:fast` leaves out the tests that need git repositories, named `*.git.test.ts`, and those that start the app, named `*.electron.test.ts`

- `npm run coverage` runs every test and writes a report to `app/coverage/`

- The installed app logs to `Fastforward.log`, and the run before to `Fastforward.previous.log`, in `%APPDATA%\Fastforward\logs` on Windows, `~/Library/Logs/Fastforward` on macOS and `~/.config/Fastforward/logs` on Linux; Ctrl+Shift+I, or Cmd+Shift+I on macOS, opens the developer tools

- `npm run dist` builds an installer for the current OS into `app/release/`

- `npm run release` bumps the major version, commits, tags and pushes it, building the installers into a draft GitHub release that installed apps update to once published
