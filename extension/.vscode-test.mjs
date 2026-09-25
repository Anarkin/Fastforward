import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  mocha: { ui: 'tdd' },
  coverage: {
    includeAll: true,
    reporter: ['text', 'html'],
  },
});
