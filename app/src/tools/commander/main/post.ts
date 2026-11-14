import type { Page } from '../../../shell/main/toolContract';
import type { CommanderToWebview } from '../shared/protocol';

export function post(page: Page, message: CommanderToWebview): void {
  page.post({ type: 'tool', tool: 'commander', message });
}
