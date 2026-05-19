import { promisify } from 'util';

const exec = promisify(require('child_process').exec);

test('npm run demo:android produces an Android report with auth findings', async () => {
  const { stdout } = await exec('npm run demo:android', {
    cwd: process.cwd(),
    timeout: 60_000,
  });
  expect(stdout).toContain('detected SDK(s):');
  expect(stdout.toLowerCase()).toMatch(/android|kotlin/);
  expect(stdout).toMatch(/\[CRITICAL\]|\[HIGH\]/);
  const findingCount = (stdout.match(/\[(CRITICAL|HIGH|MEDIUM)\]/g) || []).length;
  expect(findingCount).toBeGreaterThanOrEqual(3);
}, 70_000);
