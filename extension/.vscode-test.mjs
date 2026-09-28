import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  // The *.vscode.test.js files need VS Code; the others run here too, so the
  // coverage report covers them, and outside it with npm run test:unit
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
