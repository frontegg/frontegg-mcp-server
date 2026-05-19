import { promisify } from 'util';

const exec = promisify(require('child_process').exec);

test('npm run demo:ios produces an iOS report with deep-link findings', async () => {
  const { stdout } = await exec('npm run demo:ios', {
    cwd: process.cwd(),
    timeout: 60_000,
  });
  expect(stdout).toContain('detected SDK(s):');
  expect(stdout.toLowerCase()).toMatch(/ios|swift/);
  expect(stdout).toMatch(/\[CRITICAL\]|\[HIGH\]/);
  // The hero scene needs at least 4 visible findings
  const findingCount = (stdout.match(/\[(CRITICAL|HIGH|MEDIUM)\]/g) || []).length;
  expect(findingCount).toBeGreaterThanOrEqual(4);
}, 70_000);
