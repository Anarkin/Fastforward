# CONTRIBUTING

- Use Conventional Commits for commit messages
- Run `npm run install-local` in extension/ to install the current code into your regular VS Code, then run Developer: Restart Extension Host
- After that, run `npm run deploy-local` in extension/ to copy a new build into the installed extension, which restarts the extension host by itself; use install-local again when package.json changes
