import type { PartLooks } from '../../../lib/page/pathLooks';

export function fileLooks(hidden: readonly boolean[]): PartLooks {
  return hidden.map((each, index) => ({
    hidden: each,
    file: index === hidden.length - 1,
    executable: false,
  }));
}
