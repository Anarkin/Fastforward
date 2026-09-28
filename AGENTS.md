# AGENTS

## Instructions

### Docs

- Use only headings and simple bullet points in `.md` files; ask before using anything more complex
- Only record things in `ARCHITECTURE.md` that are not clear from the code
- All `.md` file names are uppercase
- All `.md` files' first line should be a top-level heading matching the file name, except `README.md`, whose heading is the product name because it is also the Marketplace page

### Debugging, Deployment, Development

- When debugging a reported problem, read the newest `Fastforward.log` under `%APPDATA%\Code\logs\*\window*\exthost\anarkin.fastforward\`
- After changing extension code and passing `npm run verify:fast`, run `npm run deploy-local` in `extension/` so the installed extension reloads; when `package.json` changed, run `npm run install-local` instead and ask the user to restart the extension host
- `npm run verify:fast` leaves out the tests that need VS Code and git repositories, which are named `*.vscode.test.ts`; run the full `npm run verify` before committing, and after changing code those tests cover: the Git access, the view and the extension
- Cover every fix with a test that fails without it; when the bug itself can't be tested, as with layout in a real browser, move the logic behind the fix into code that can be, and test that
