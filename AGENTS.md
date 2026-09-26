# AGENTS

## Instructions

### Docs

- Use only headings and simple bullet points in .md files; ask before using anything more complex
- Only record things in ARCHITECTURE.md that are not clear from the code
- All .md file names are uppercase
- All .md files' first line should be a top-level heading matching the file name, except README.md, whose heading is the product name because it is also the Marketplace page

### Debugging, Deployment, Development

- When debugging a reported problem, read the newest `Fastforward.log` under `%APPDATA%\Code\logs\*\window*\exthost\anarkin.fastforward\`
- After changing extension code and passing verify, run `npm run deploy-local` in extension/ so the installed extension reloads; when package.json changed, run `npm run install-local` instead and ask the user to restart the extension host
