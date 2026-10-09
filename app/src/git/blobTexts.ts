// Kept by blob id, as a blob's text never changes, bounded by characters
export class BlobTexts {
  private readonly texts = new Map<string, string>();
  private chars = 0;

  constructor(private readonly maxChars: number) {}

  async read(
    ids: readonly string[],
    read: (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>,
  ): Promise<Map<string, string>> {
    const unknown = [...new Set(ids)].filter((id) => !this.texts.has(id));
    const fresh = unknown.length === 0 ? new Map() : await read(unknown);
    const found = new Map<string, string>();
    for (const id of ids) {
      const text = this.texts.get(id) ?? fresh.get(id);
      if (text !== undefined) {
        found.set(id, text);
        this.keep(id, text);
      }
    }
    return found;
  }

  private keep(id: string, text: string): void {
    if (this.texts.delete(id)) {
      this.chars -= text.length;
    }
    if (text.length > this.maxChars) {
      return;
    }
    this.texts.set(id, text);
    this.chars += text.length;
    for (const [oldest, dropped] of this.texts) {
      if (this.chars <= this.maxChars) {
        break;
      }
      this.texts.delete(oldest);
      this.chars -= dropped.length;
    }
  }
}
