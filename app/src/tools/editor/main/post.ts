import type { Page } from '../../../shell/main/toolContract';
import type { EditorToWebview } from '../shared/protocol';

export function post(page: Page, message: EditorToWebview): void {
  page.post({ type: 'tool', tool: 'editor', message });
}
