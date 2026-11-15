export function savedEnv(names: readonly string[]): () => void {
  const saved = names.map((name) => [name, process.env[name]] as const);
  return () => setEnv(Object.fromEntries(saved));
}

function setEnv(variables: Readonly<Record<string, string | undefined>>) {
  for (const [name, value] of Object.entries(variables)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

export async function withEnv(
  variables: Readonly<Record<string, string | undefined>>,
  run: () => Promise<void>,
): Promise<void> {
  const restore = savedEnv(Object.keys(variables));
  setEnv(variables);
  try {
    await run();
  } finally {
    restore();
  }
}
