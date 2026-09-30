// The values of RefType, which git.d.ts declares as a const enum that esbuild
// can't inline from a declaration file; without vscode, so the unit tests
// can use them outside VS Code
export const RefType = { Head: 0, RemoteHead: 1, Tag: 2 } as const;
