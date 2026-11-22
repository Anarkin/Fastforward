import { framesOfFile } from './fileFrames';

for (const wordWrap of [false, true]) {
  framesOfFile(
    process.env.FASTFORWARD_PERF_FILE,
    wordWrap,
    'the file asked for',
  );
}
