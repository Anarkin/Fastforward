# ARCHITECTURE

## Decisions

- Use the built-in VS Code Git extension API for anything it supports, and call the git CLI for anything it can't do
- Use Oxlint instead of ESLint, because typescript-eslint does not support TypeScript 7 yet
- The view's webview is kept alive while hidden (retainContextWhenHidden), so toggling it is instant
