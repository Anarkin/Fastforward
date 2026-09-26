import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  // The repository tests read this repository through the Git extension API
  workspaceFolder: '..',
  mocha: { ui: 'tdd' },
  coverage: {
    includeAll: true,
    reporter: ['text', 'html'],
  },
});
