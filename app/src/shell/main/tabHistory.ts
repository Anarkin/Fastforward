export class TabHistory {
  private visits: readonly string[] = [];

  visit(id: string): void {
    this.visits = [id, ...this.visits.filter((visited) => visited !== id)];
  }

  forget(id: string): void {
    this.visits = this.visits.filter((visited) => visited !== id);
  }

  after(
    closed: string,
    rest: readonly { readonly id: string }[],
    index: number,
  ): string | undefined {
    return (
      this.visits.find(
        (visited) =>
          visited !== closed && rest.some((tab) => tab.id === visited),
      ) ?? rest.at(Math.min(index, rest.length - 1))?.id
    );
  }
}
