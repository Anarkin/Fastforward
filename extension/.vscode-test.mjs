import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  // The Fastforward repository, which the Git extension then opens first, so
  // the tab every view adds for the repository open in VS Code is this one,
  // not whichever temp repository a test opened
  workspaceFolder: '..',
  mocha: { ui: 'tdd' },
  coverage: {
    includeAll: true,
    reporter: ['text', 'html'],
  },
});
