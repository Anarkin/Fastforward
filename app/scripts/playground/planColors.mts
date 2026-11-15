import type { PlanBuilder } from './filesPlan.mts';
import { defaultColorGroups } from './appFacts.mts';

export function planColors(builder: PlanBuilder): void {
  const { file, folder, section } = builder;
  section(
    'colors',
    'One empty file for every extension of every default color group, a program by its exec bit on macOS and Linux, files on a drive marking every file so, a macOS app, and files no group colors. Turn on Group by color with Ctrl+G.',
  );
  for (const { extensions } of defaultColorGroups()) {
    if (Array.isArray(extensions)) {
      for (const extension of extensions) {
        file(`colors/sample.${extension}`, '');
      }
    }
  }
  file('colors/source.ts', 'export const colored = "by its language";\n');
  file('colors/Makefile', 'all:\n\techo "colored by its whole name"\n');
  file('colors/Dockerfile', 'FROM alpine\n');
  file('colors/program', '#!/bin/sh\necho "a program without an extension"\n', {
    mode: 0o755,
  });
  file('colors/python3.12', '#!/bin/sh\necho "a versioned program"\n', {
    mode: 0o755,
  });
  file(
    'colors/notes-on-a-usb-stick.txt',
    'Every file of a FAT drive can run.\n',
    {
      mode: 0o755,
    },
  );
  file('colors/photo-on-a-usb-stick.jpg', '', { mode: 0o755 });
  file('colors/script-on-a-usb-stick.py', 'print("still Python")\n', {
    mode: 0o755,
  });
  folder('colors/Playground.app');
  file(
    'colors/Playground.app/Contents/Info.plist',
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>Playground</string></dict></plist>\n',
  );
  file(
    'colors/Playground.app/Contents/MacOS/Playground',
    '#!/bin/sh\necho "Hello from an app bundle"\n',
    { mode: 0o755 },
  );
  for (const plain of [
    'LICENSE',
    'server.key',
    'id_ed25519.pub',
    'core.dll',
    'data.bin',
    'contacts.vcf',
    'font.woff2',
  ]) {
    file(`colors/${plain}`, '');
  }
}
