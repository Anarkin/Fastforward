import * as path from 'node:path';
import type { Tab } from '../../../shell/main/toolContract';
import type { Icons } from './icons';
import { iconSourceOf, iconTicketOf } from '../shared/icons';
import { type Sides } from './sides';
import { listedIn } from './listedEntries';

export class Serving {
  constructor(
    private readonly sides: Sides,
    private readonly icons: Icons,
    private readonly tabs: () => readonly Tab[],
  ) {}

  async icon(url: URL): Promise<Response> {
    const source = iconSourceOf(url);
    const pane = source && this.sides.panes.get(source.tab)?.[source.side];
    const entry = listedIn(pane, source?.name);
    if (
      source === undefined ||
      pane === undefined ||
      pane.folder !== source.folder ||
      entry === undefined ||
      entry.folder
    ) {
      return new Response(null, { status: 404 });
    }
    return this.iconResponse(
      path.join(pane.folder, source.name),
      iconTicketOf(url),
    );
  }

  private async iconResponse(file: string, ticket?: string): Promise<Response> {
    try {
      const png = await this.icons.of(file, ticket);
      return new Response(Buffer.from(png), {
        headers: { 'content-type': 'image/png' },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  }
}
