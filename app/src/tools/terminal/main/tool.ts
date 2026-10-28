import { EmptyTool } from '../../../shell/main/emptyTool';

export class TerminalTool extends EmptyTool<'terminal'> {
  constructor() {
    super('terminal');
  }
}
