import type { Page } from '../../../shell/main/toolContract';
import type { ViewerToWebview } from '../shared/protocol';

export function post(page: Page, message: ViewerToWebview): void {
  page.post({ type: 'tool', tool: 'viewer', message });
}
