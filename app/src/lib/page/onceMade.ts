export function onceMade<T>(make: () => Promise<T>): () => Promise<T> {
  let made: Promise<T> | undefined;
  return () => {
    made ??= make().catch((error: unknown) => {
      made = undefined;
      throw error;
    });
    return made;
  };
}
