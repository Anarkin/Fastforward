import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  sourceFiles,
  importsOf,
  componentOf,
  components,
  sourceFilesOf,
  usesOf,
  partOf,
} from './helpers/sourceGraph';

const componentDoors: Readonly<Record<string, readonly string[]>> = {
  editing: [
    'components/editing/page/plainText.ts',
    'components/editing/page/textSteps.ts',
  ],
  cells: [
    'components/cells/page/cellColors.ts',
    'components/cells/page/cellFont.ts',
    'components/cells/page/characterNames.ts',
    'components/cells/page/cellLook.ts',
    'components/cells/page/cellPainting.ts',
    'components/cells/page/cellView.ts',
    'components/cells/page/cellWindow.ts',
    'components/cells/page/seen.ts',
    'components/cells/page/shapeLayer.ts',
    'components/cells/page/cellSurface.ts',
    'components/cells/page/runAtlas.ts',
    'components/cells/page/listCanvas.ts',
    'components/cells/page/listLooks.ts',
    'components/cells/page/runText.ts',
    'components/cells/page/columns.ts',
    'components/cells/page/glyphWarmth.ts',
    'components/cells/page/gpuDevice.ts',
    'components/cells/page/idleWork.ts',
    'components/cells/page/lines.ts',
    'components/cells/page/marks.ts',
    'components/cells/page/textCells.ts',
    'components/cells/page/textPlaces.ts',
    'components/cells/page/textSelection.ts',
  ],
  encodings: [
    'components/encodings/main/codePages.ts',
    'components/encodings/main/encodingDetection.ts',
    'components/encodings/main/textCodings.ts',
    'components/encodings/page/encodings.ts',
    'components/encodings/shared/byteOrderMarks.ts',
    'components/encodings/shared/textEncodings.ts',
  ],
  diff: [
    'components/diff/main/args.ts',
    'components/diff/main/imageReads.ts',
    'components/diff/main/textRequests.ts',
    'components/diff/page/diff.ts',
    'components/diff/page/keymap.ts',
    'components/diff/page/place.ts',
    'components/diff/page/rows.ts',
    'components/diff/page/slice.ts',
    'components/diff/page/syntax.ts',
    'components/diff/page/sideTexts.ts',
    'components/diff/page/slicedDiff.tsx',
    'components/diff/page/textsToLoad.ts',
    'components/diff/page/viewedSource.ts',
    'components/diff/shared/protocol.ts',
    'components/diff/shared/settings.ts',
    'components/diff/shared/imageSources.ts',
    'components/diff/shared/patchBudget.ts',
  ],
  syntax: [
    'components/syntax/page/colorer.ts',
    'components/syntax/page/engine.ts',
    'components/syntax/page/languageChoice.tsx',
    'components/syntax/page/languageMenu.ts',
    'components/syntax/page/lineColors.ts',
    'components/syntax/page/parts.ts',
    'components/syntax/shared/colorLimit.ts',
  ],
  versions: [
    'components/versions/page/versionButton.tsx',
    'components/versions/shared/versions.ts',
  ],
};

suite('Components', () => {
  test('names each component with the doors it opens to the parts that use it', () => {
    assert.deepStrictEqual(
      components.toSorted(),
      Object.keys(componentDoors).toSorted(),
    );
  });

  test('lets a component import only the library, its own code and the doors of other components, as it knows nothing of the tools or the shell that show it', () => {
    assert.deepStrictEqual(
      sourceFiles
        .filter((file) => file.startsWith('components/'))
        .flatMap((file) =>
          importsOf(file)
            .flatMap((target) =>
              target.startsWith('lib/') ? [target] : sourceFilesOf(target),
            )
            .filter((target) => {
              const component = componentOf(target);
              return (
                !target.startsWith('lib/') &&
                component !== componentOf(file) &&
                (component === undefined ||
                  !(componentDoors[component] ?? []).includes(target))
              );
            })
            .map((target) => `${file} -> ${target}`),
        ),
      [],
    );
  });

  test('lets no component use itself through other components, so they build on each other in one order', () => {
    const uses = new Map(
      components.map((component) => [
        component,
        new Set(
          sourceFiles
            .filter((file) => componentOf(file) === component)
            .flatMap((file) => usesOf(file).map(componentOf))
            .filter(
              (used): used is string =>
                used !== undefined && used !== component,
            ),
        ),
      ]),
    );
    const reaches = (from: string, to: string, seen: Set<string>): boolean =>
      [...(uses.get(from) ?? [])].some(
        (next) =>
          next === to || (!seen.has(next) && reaches(next, to, seen.add(next))),
      );
    assert.deepStrictEqual(
      components.filter((component) =>
        reaches(component, component, new Set()),
      ),
      [],
    );
  });

  test('lets the other parts reach a component only through the doors it lists, each a door some of them use, so what lies behind them can change without them', () => {
    assert.deepStrictEqual(
      sourceFiles
        .filter((file) => !file.startsWith('components/'))
        .flatMap((file) =>
          importsOf(file)
            .flatMap(sourceFilesOf)
            .filter((target) => {
              const component = componentOf(target);
              return (
                component !== undefined &&
                !(componentDoors[component] ?? []).includes(target)
              );
            })
            .map((target) => `${file} -> ${target}`),
        ),
      [],
    );
    const entered = new Set(
      sourceFiles
        .filter((file) => !file.startsWith('components/'))
        .flatMap((file) => importsOf(file).flatMap(sourceFilesOf)),
    );
    assert.deepStrictEqual(
      Object.entries(componentDoors).flatMap(([component, doors]) =>
        doors.filter(
          (door) =>
            !door.startsWith(`components/${component}/`) ||
            !sourceFiles.includes(door) ||
            !entered.has(door),
        ),
      ),
      [],
    );
  });

  test('keeps a component only while two parts or more use it, themselves or through another component, as what one tool alone uses belongs to that tool', () => {
    const reaches = (
      file: string,
      component: string,
      seen: Set<string>,
    ): boolean =>
      usesOf(file).some(
        (target) =>
          componentOf(target) === component ||
          (componentOf(target) !== undefined &&
            !seen.has(target) &&
            reaches(target, component, seen.add(target))),
      );
    assert.deepStrictEqual(
      components.filter(
        (component) =>
          new Set(
            sourceFiles
              .filter(
                (file) =>
                  !file.startsWith('components/') &&
                  reaches(file, component, new Set()),
              )
              .map(partOf),
          ).size < 2,
      ),
      [],
    );
  });
});
