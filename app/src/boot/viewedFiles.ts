import * as fs from 'node:fs';
import * as path from 'node:path';

export async function removeUnviewedCopies(
  copies: string,
  viewed: readonly string[],
): Promise<void> {
  const kept = new Set(
    viewed.flatMap((file) => {
      const inside = path.relative(copies, file);
      const [entry] = inside.split(path.sep);
      return inside === '' || entry === '..' || path.isAbsolute(inside)
        ? []
        : [entry];
    }),
  );
  const entries = await fs.promises.readdir(copies).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => !kept.has(entry))
      .map((entry) =>
        fs.promises
          .rm(path.join(copies, entry), { recursive: true, force: true })
          .catch(() => undefined),
      ),
  );
}
