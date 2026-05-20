import path from 'path';
import { promises as fs } from 'fs';

export async function commonDiffFor(root: string, id: string): Promise<string | null> {
  if (id.startsWith('common.env.missing')) {
    const envPath = path.join(root, '.env');
    return createEnvAppendDiff(envPath, [
      'FRONTEGG_APP_ID=your-app-id-here',
      'FRONTEGG_BASE_URL=https://app-your-subdomain.frontegg.com',
    ]);
  }
  return null;
}

export async function createEnvAppendDiff(envPath: string, lines: string[]): Promise<string> {
  try {
    await fs.access(envPath);
  } catch {
    const content = lines.join('\n') + '\n';
    return [
      `--- /dev/null`,
      `+++ ${envPath}`,
      `@@`,
      `${content.split('\n').map(l => l ? `+${l}` : '+').join('\n')}`,
    ].join('\n');
  }
  const original = await fs.readFile(envPath, 'utf8');
  const toAdd = lines.filter(l => !original.includes(l));
  if (toAdd.length === 0) return '# Up-to-date: no changes needed.';
  const added = toAdd.join('\n') + '\n';
  return [
    `--- ${envPath}`,
    `+++ ${envPath}`,
    `@@`,
    `${added.split('\n').map(l => l ? `+${l}` : '+').join('\n')}`,
  ].join('\n');
}
