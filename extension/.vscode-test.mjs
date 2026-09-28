import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  // The *.vscode.test.js files need VS Code; the others run here too, so the
  // coverage report covers them, and outside it with npm run test:unit
  files: 'out/test/**/*.test.js',
  // Every view adds the repository open in VS Code as a tab, which is then
  // this one rather than whichever temp repository the Git extension opened
  // first
  workspaceFolder: '..',
  mocha: { ui: 'tdd' },
  coverage: {
    includeAll: true,
    reporter: ['text', 'html'],
  },
});
