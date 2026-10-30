import { EmptyTool } from '../../../shell/main/emptyTool';

export class CommanderTool extends EmptyTool<'commander'> {
  constructor() {
    super('commander');
  }
}
