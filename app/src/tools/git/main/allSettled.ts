export async function allSettled(
  promises: readonly Promise<unknown>[],
): Promise<void> {
  const failed = (await Promise.allSettled(promises)).find(
    (result) => result.status === 'rejected',
  );
  if (failed) {
    throw failed.reason;
  }
}
