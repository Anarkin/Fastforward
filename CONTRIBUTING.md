# CONTRIBUTING

## Commit Messages

- Use Conventional Commits

## Code Comments

- No code comments unless the _why_ is genuinely non-obvious. Never restate the code, narrate your changes, or leave commented-out code. If a comment would describe expected behavior, express it as a test instead. Keep comments to an absolute minimum.

## Local Development and Debugging

- Run `npm install` in `app/`
- Run `npm run install-local` in `app/` to install the current code into your regular VS Code, then run Developer: Restart Extension Host
- After that, run `npm run deploy-local` in `app/` to copy a new build into the installed extension, which restarts the extension host by itself; use `npm run install-local` again when `package.json` changes
- When debugging a reported problem, read the newest `Fastforward.log` under `logs\*\window*\exthost\anarkin.fastforward\` in VS Code's data folder: `%APPDATA%\Code` on Windows, `~/Library/Application Support/Code` on macOS and `~/.config/Code` on Linux

## Testing

- `npm run verify:fast` leaves out the tests that need VS Code and git repositories, which are named `*.vscode.test.ts`; run the full `npm run verify` before committing, and after changing code those tests cover: the Git access, the view and the extension
