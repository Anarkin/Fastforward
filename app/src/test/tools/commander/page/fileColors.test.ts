import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  colorOfFileNamed,
  fileColorOf,
  fileColorsOf,
} from '../../../../tools/commander/page/fileColors';
import { languageOf } from '../../../../lib/page/languages';
import type { Entry } from '../../../../tools/commander/shared/protocol';
import { defaultSettings } from '../../../fixtures';

const file = (name: string, extra: Partial<Entry> = {}): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
  ...extra,
});

const defaults = fileColorsOf(defaultSettings().tools.commander.fileColors);
const executable = 'light-dark(#a0a, #da7)';
const document = 'light-dark(#080, #5a5)';
const media = 'light-dark(#d00, #e75)';
const archive = 'light-dark(#088, #088)';
const language = 'light-dark(#00d, #59c)';

const colorsOf = (light: string) => ({ light, dark: light });

suite('Commander file colors', () => {
  test('colors by default as functions are colored in code the programs, installers and scripts that run when opened, of Windows, macOS and Linux, whatever the case of their extension', () => {
    for (const name of [
      'setup.exe',
      'TOOL.COM',
      'node-v24.msi',
      'KB5034441.msu',
      'patch.msp',
      'app.msix',
      'app.appx',
      'app.appinstaller',
      'bubbles.scr',
      'display.cpl',
      'wizard.hta',
      'build.bat',
      'ff.cmd',
      'cleanup.ps1',
      'legacy.vbs',
      'old.vbe',
      'old.jse',
      'job.wsf',
      'Install.pkg',
      'Bundle.mpkg',
      'start.command',
      'helper.tool',
      'tool.AppImage',
      'driver.run',
      'firefox.desktop',
      'tool.deb',
      'tool.rpm',
      'tool.snap',
      'tool.flatpak',
      'flathub.flatpakref',
      'deploy.sh',
      'setup.bash',
      'prompt.zsh',
      'config.fish',
    ]) {
      assert.strictEqual(fileColorOf(file(name), defaults), executable, name);
    }
  });

  test('colors by default as comments are colored in code the documents: the prose read in an editor, PDFs, Office and OpenDocument files, ebooks, the Google Drive shortcuts, OneNote and the emails saved', () => {
    for (const name of [
      'README.md',
      'notes.markdown',
      'index.rst',
      'guide.adoc',
      'notes.txt',
      'todo.org',
      'invoice.pdf',
      'letter.docx',
      'old.DOC',
      'budget.xlsx',
      'slides.pptx',
      'draft.odt',
      'drawing.odg',
      'letter.dotm',
      'budget.xltx',
      'deck.potm',
      'diagram.vsdx',
      'schedule.mpp',
      'book.epub',
      'book.fb2',
      'comic.cbz',
      'help.chm',
      'plan.gdoc',
      'sheet.gsheet',
      'trip.gmap',
      'survey.gform',
      'intranet.gsite',
      'board.gjam',
      'notes.one',
      'reply.eml',
      'outlook.msg',
      'inbox.mbox',
    ]) {
      assert.strictEqual(fileColorOf(file(name), defaults), document, name);
    }
  });

  test('colors by default as strings are colored in code the images, photos in camera raw and editor files, audio and video', () => {
    for (const name of [
      'logo.png',
      'IMG_2041.JPG',
      'photo.heic',
      'photo.jfif',
      'icon.svg',
      'AppIcon.icns',
      'shot.dng',
      'shot.pef',
      'cover.psd',
      'logo.ai',
      'poster.eps',
      'screen.fig',
      'song.mp3',
      'album.flac',
      'album.ape',
      'book.m4b',
      'clip.mp4',
      'movie.mkv',
      'call.webm',
      'old.rmvb',
      'camera.mxf',
    ]) {
      assert.strictEqual(fileColorOf(file(name), defaults), media, name);
    }
  });

  test('colors by default as types are colored in code the archives and compressed files, the tar ones by their last extension, the disk images, the virtual disks and the packages, leaving the installers colored as the programs', () => {
    for (const name of [
      'backup.zip',
      'tools.7z',
      'old.RAR',
      'project.tar',
      'project.tar.gz',
      'project.tgz',
      'logs.tar.xz',
      'source.tar.zst',
      'server.log.gz',
      'windows.iso',
      'disk.vhdx',
      'macos.dmg',
      'old.sit',
      'vm.qcow2',
      'vm.vmdk',
      'appliance.ova',
      'app.jar',
      'app.war',
      'app.apk',
      'App.ipa',
      'package.whl',
      'package.nupkg',
      'extension.vsix',
      'addon.xpi',
      'server.log.gzip',
      'dump.bzip2',
      'old.taz',
      'backup.7z.001',
      'Xcode.xip',
      'vm.qcow',
      'checkpoint.avhdx',
      'app.asar',
      'app.apks',
      'package.snupkg',
      'serde.crate',
      'numpy.conda',
    ]) {
      assert.strictEqual(fileColorOf(file(name), defaults), archive, name);
    }
    for (const name of ['setup.msi', 'tool.deb', 'Install.pkg']) {
      assert.strictEqual(fileColorOf(file(name), defaults), executable, name);
    }
  });

  test('colors by default as keywords are colored in code the video extensions TypeScript uses, the PowerPoint templates gettext uses and data in CSV, as the viewer reads them as TypeScript, gettext and CSV', () => {
    for (const name of [
      'recording.ts',
      'clip.mts',
      'messages.pot',
      'messages.potx',
      'export.csv',
    ]) {
      assert.strictEqual(fileColorOf(file(name), defaults), language, name);
    }
  });

  test('leaves plain by default the subtitles, playlists, fonts and 3D models, the Keynote extension private keys use, the Publisher one public keys use, the tracker music Go modules use and the contacts and calendars', () => {
    for (const name of [
      'server.key',
      'id_ed25519.pub',
      'song.mod',
      'contacts.vcf',
      'meeting.ics',
      'movie.srt',
      'captions.vtt',
      'mix.m3u',
      'font.woff2',
      'model.glb',
    ]) {
      assert.strictEqual(fileColorOf(file(name), defaults), undefined, name);
    }
  });

  test('colors by default as keywords are colored in code the source and config the viewer knows the language of, by their extension or their whole name', () => {
    for (const name of [
      'main.ts',
      'esbuild.config.mts',
      'app.js',
      'package.json',
      'settings.yml',
      'Makefile',
      'Dockerfile',
      '.md',
    ]) {
      assert.strictEqual(fileColorOf(file(name), defaults), language, name);
    }
  });

  test('leaves plain by default the libraries, the files the viewer knows no language of and everything else', () => {
    for (const name of ['.gitignore', 'LICENSE', 'core.dll', 'data.bin']) {
      assert.strictEqual(fileColorOf(file(name), defaults), undefined, name);
    }
  });

  test('leaves folders plain, whatever their name, but the apps of macOS, which are folders named .app, colored as the group listing app colors them', () => {
    assert.strictEqual(
      fileColorOf(file('tools.exe', { folder: true }), defaults),
      undefined,
    );
    assert.strictEqual(
      fileColorOf(file('Safari.app', { folder: true }), defaults),
      executable,
    );
    assert.strictEqual(
      fileColorOf(
        file('Preview.APP', { folder: true }),
        fileColorsOf([
          { extensions: ['app'], colors: colorsOf('#001') },
          { extensions: 'executables', colors: colorsOf('#002') },
        ]),
      ),
      'light-dark(#001, #001)',
    );
    assert.strictEqual(
      fileColorOf(
        file('Safari.app', { folder: true }),
        fileColorsOf([{ extensions: ['exe'], colors: colorsOf('#001') }]),
      ),
      undefined,
    );
  });

  test('colors by default as the programs the files macOS and Linux may run, by their exec bit, that no group of extensions and no language claims, so that the files of a drive marking every file so keep their colors', () => {
    for (const name of ['git', 'python3.12', 'node-v24', 'configure']) {
      assert.strictEqual(
        fileColorOf(file(name, { executable: true }), defaults),
        executable,
        name,
      );
      assert.strictEqual(fileColorOf(file(name), defaults), undefined, name);
    }
    for (const [name, color] of [
      ['build.py', language],
      ['Makefile', language],
      ['notes.txt', document],
      ['photo.jpg', media],
      ['backup.zip', archive],
    ]) {
      assert.strictEqual(
        fileColorOf(file(name, { executable: true }), defaults),
        color,
        name,
      );
    }
  });

  test('colors the files with an exec bit where the group of the executables is, an earlier group keeping its extensions, a later one and the languages after it giving way, and the first group of the executables counting alone', () => {
    const groups = fileColorsOf([
      { extensions: ['txt'], colors: colorsOf('#001') },
      { extensions: 'executables', colors: colorsOf('#002') },
      { extensions: 'languages', colors: colorsOf('#003') },
      { extensions: ['jpg'], colors: colorsOf('#004') },
      { extensions: 'executables', colors: colorsOf('#005') },
    ]);
    for (const [name, color] of [
      ['notes.txt', '#001'],
      ['git', '#002'],
      ['build.py', '#002'],
      ['photo.jpg', '#002'],
    ]) {
      assert.strictEqual(
        fileColorOf(file(name, { executable: true }), groups),
        `light-dark(${color}, ${color})`,
        name,
      );
    }
    assert.strictEqual(
      fileColorOf(file('build.py'), groups),
      'light-dark(#003, #003)',
    );
    assert.strictEqual(
      fileColorOf(
        file('git', { executable: true }),
        fileColorsOf([{ extensions: ['exe'], colors: colorsOf('#001') }]),
      ),
      undefined,
    );
  });

  test('gives by default no extension of a language to a group before the languages but those named here, the scripts that run when opened, the prose of Markdown and the like and SVG, so that no code turns into a video or a document', () => {
    const groups = defaultSettings().tools.commander.fileColors;
    const claimed = groups
      .slice(
        0,
        groups.findIndex(({ extensions }) => extensions === 'languages'),
      )
      .flatMap(({ extensions }) =>
        Array.isArray(extensions) ? extensions : [],
      )
      .filter((extension) => languageOf(`file.${extension}`) !== undefined);
    assert.deepStrictEqual(
      claimed.toSorted((a, b) => a.localeCompare(b)),
      [
        'adoc',
        'asciidoc',
        'bash',
        'bat',
        'cmd',
        'desktop',
        'fish',
        'markdown',
        'md',
        'org',
        'ps1',
        'rst',
        'sh',
        'svg',
        'zsh',
      ],
    );
  });

  test('takes the extensions of a group with or without their dot and in any case, the first group naming an extension giving its color', () => {
    const colors = fileColorsOf([
      { extensions: ['.PNG', 'jpg'], colors: { light: '#a0a', dark: '#f0f' } },
      { extensions: ['png', 'svg'], colors: { light: '#00a', dark: '#00f' } },
    ]);
    assert.strictEqual(
      fileColorOf(file('logo.png'), colors),
      'light-dark(#a0a, #f0f)',
    );
    assert.strictEqual(
      fileColorOf(file('photo.JPG'), colors),
      'light-dark(#a0a, #f0f)',
    );
    assert.strictEqual(
      fileColorOf(file('icon.svg'), colors),
      'light-dark(#00a, #00f)',
    );
  });

  test('colors a file by its name alone, as the viewer knows no more of it', () => {
    assert.strictEqual(colorOfFileNamed('report.PDF', defaults), document);
    assert.strictEqual(colorOfFileNamed('setup.exe', defaults), executable);
    assert.strictEqual(colorOfFileNamed('.bashrc', defaults), undefined);
    assert.strictEqual(colorOfFileNamed('Makefile', defaults), language);
  });

  test('colors the languages where their group is, an earlier group keeping its extensions and the first group of the languages counting alone', () => {
    const last = fileColorsOf([
      { extensions: ['ps1'], colors: colorsOf('#001') },
      { extensions: 'languages', colors: colorsOf('#002') },
      { extensions: 'languages', colors: colorsOf('#003') },
    ]);
    assert.strictEqual(
      colorOfFileNamed('run.ps1', last),
      'light-dark(#001, #001)',
    );
    assert.strictEqual(
      colorOfFileNamed('main.rs', last),
      'light-dark(#002, #002)',
    );
    const first = fileColorsOf([
      { extensions: 'languages', colors: colorsOf('#002') },
      { extensions: ['ps1'], colors: colorsOf('#001') },
    ]);
    assert.strictEqual(
      colorOfFileNamed('run.ps1', first),
      'light-dark(#002, #002)',
    );
    assert.strictEqual(colorOfFileNamed('setup.exe', first), undefined);
  });
});
