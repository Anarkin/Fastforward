import type { Page } from '../../../shell/main/toolContract';
import type { DiffToWebview } from '../shared/protocol';

export function post(page: Page, message: DiffToWebview): void {
  page.post({ type: 'tool', tool: 'diff', message });
}
