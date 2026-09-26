# ARCHITECTURE

## Decisions

- Use the built-in VS Code Git extension API for anything it supports, and call the git CLI for anything it can't do
- Use Oxlint instead of ESLint, because typescript-eslint does not support TypeScript 7 yet
- The view is a custom editor opened with the internal _workbench.openWith command and group -4, because that is the only way for an extension to open an editor in the modal editor part
