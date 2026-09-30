# CONTRIBUTING

## Commit Messages

- Use Conventional Commits

## Code Comments

- No code comments unless the _why_ is genuinely non-obvious. Never restate the code, narrate your changes, or leave commented-out code. If a comment would describe expected behavior, express it as a test instead. Keep comments to an absolute minimum.

## Local Development and Debugging

- Run `npm install` in `app/`
- Run `npm start` in `app/` to build and open the app, or `npm run dev` to rebuild on every change, which restarts the app after main process changes and reloads the page after the rest
- Run `npm run dist` in `app/` to build an installer for the current OS into `app/release/`
- When debugging a reported problem, read `Fastforward.log`, and `Fastforward.previous.log` for the run before, in the app's logs folder: `%APPDATA%\Fastforward\logs` on Windows, `~/Library/Logs/Fastforward` on macOS and `~/.config/Fastforward/logs` on Linux; Ctrl+Shift+I, or Cmd+Shift+I on macOS, opens the developer tools

## Testing

- `npm run verify:fast` leaves out the tests that need git repositories, which are named `*.git.test.ts`; run the full `npm run verify` before committing, and after changing code those tests cover: the Git access and the view
