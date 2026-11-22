import * as path from 'node:path';
import { framesOfFile } from './fileFrames';
import { perfData } from './perfFixtures';

const { heavy, heavyFiles } = perfData();

for (const { name, heavy: what, oneLine } of heavyFiles) {
  for (const wordWrap of [false, true]) {
    framesOfFile(
      path.join(heavy, name),
      wordWrap,
      `${name}, ${what}`,
      oneLine !== true || wordWrap,
    );
  }
}
