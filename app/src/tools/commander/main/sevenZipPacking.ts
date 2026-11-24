import { fs } from '../../../lib/main/files';
import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import type { PackLevel } from '../shared/packing';
import type { PackOptions, PackPlan, Packing } from './archiveReader';
import { listOf, packNames, type SevenZip } from './sevenZip';
import { outcomeOf, packOutput } from './sevenZipOutput';

const packLevels: Record<PackLevel, number> = {
  store: 0,
  fastest: 1,
  normal: 5,
  maximum: 7,
  ultra: 9,
};

function tarNameOf(archive: string): string {
  const bare = path.basename(archive).replace(/\.(?:gz|xz)$/i, '');
  return /\.tar$/i.test(bare) ? bare : `${bare.replace(/\.t[gx]z$/i, '')}.tar`;
}

function packRun(
  plan: PackPlan,
  into: string,
  list: string,
  progress: boolean,
): { readonly args: readonly string[]; readonly pipeInto?: readonly string[] } {
  const level = `-mx${packLevels[plan.level]}`;
  const volumes =
    plan.volumeBytes === undefined ? [] : [`-v${plan.volumeBytes}b`];
  if (plan.format === 'tar.gz' || plan.format === 'tar.xz') {
    return {
      args: [
        'a',
        '-ttar',
        '-so',
        '-an',
        ...packNames,
        '-bso2',
        progress ? '-bsp2' : '-bsp0',
        `-i@${list}`,
        '--',
      ],
      pipeInto: [
        'a',
        plan.format === 'tar.gz' ? '-tgzip' : '-txz',
        level,
        `-si${tarNameOf(plan.archive)}`,
        ...volumes,
        '-bso0',
        '-bsp0',
        '--',
        into,
      ],
    };
  }
  const cipher =
    plan.format === 'zip'
      ? [`-mem=${plan.zipCipher === 'zipCrypto' ? 'ZipCrypto' : 'AES256'}`]
      : plan.encryptNames === true
        ? ['-mhe=on']
        : [];
  return {
    args: [
      'a',
      `-t${plan.format}`,
      ...(plan.format === 'tar' ? [] : [level]),
      ...(passwordUsed(plan) ? ['-p', ...cipher] : []),
      ...volumes,
      ...packNames,
      ...(progress ? ['-bsp1'] : []),
      `-i@${list}`,
      '--',
      into,
    ],
  };
}

function passwordUsed(plan: PackPlan): boolean {
  return (
    plan.password !== undefined &&
    (plan.format === 'zip' || plan.format === '7z')
  );
}

export async function packed(
  sevenZip: SevenZip,
  plan: PackPlan,
  into: string,
  options: PackOptions = {},
): Promise<Packing> {
  const names = listOf(plan.items);
  if (names === undefined) {
    return { kind: 'refused', reason: strings.commander.lineBreakInName };
  }
  const list = `${into}.paths`;
  await fs.promises.writeFile(list, names);
  const { signal } = options;
  const onOutput = packOutput(options);
  const { args, pipeInto } = packRun(plan, into, list, onOutput !== undefined);
  try {
    const run = await sevenZip(args, {
      cwd: plan.folder,
      ...(signal !== undefined && { signal }),
      ...(pipeInto !== undefined && { pipeInto }),
      ...(passwordUsed(plan) && { input: `${plan.password}\n` }),
      ...(onOutput !== undefined && { onOutput }),
    });
    return outcomeOf(run, into);
  } finally {
    await fs.promises.rm(list, { force: true });
  }
}
