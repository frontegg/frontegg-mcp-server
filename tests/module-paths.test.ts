/**
 * Tests for src/utils/module-paths.ts — the cross-runtime path resolution
 * helper used by logger.ts + config-manager.ts.
 *
 * The helper hides `import.meta.url` behind `new Function()` so it stays
 * portable between ESM (production) and CJS (ts-jest's default transform).
 * These tests exercise the public API; the `new Function` indirection is
 * implementation detail.
 */

import { existsSync, statSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

import { getPackageRoot, getMcpEnvPath, getLogsDir } from '../src/utils/module-paths.js';

describe('getPackageRoot', () => {
  it('returns an absolute path', () => {
    const root = getPackageRoot();
    expect(isAbsolute(root)).toBe(true);
  });

  it('points at a directory that exists', () => {
    const root = getPackageRoot();
    expect(existsSync(root)).toBe(true);
    expect(statSync(root).isDirectory()).toBe(true);
  });

  it('points at the package root (directory contains package.json)', () => {
    const root = getPackageRoot();
    expect(existsSync(join(root, 'package.json'))).toBe(true);
  });

  it('is cached: two calls return the same string instance-equal value', () => {
    const a = getPackageRoot();
    const b = getPackageRoot();
    expect(b).toBe(a);
  });

  it('package.json at the resolved root has @frontegg/frontegg-mcp-server name', async () => {
    const root = getPackageRoot();
    const pkg = JSON.parse(
      await (await import('node:fs/promises')).readFile(join(root, 'package.json'), 'utf8'),
    );
    expect(pkg.name).toBe('@frontegg/frontegg-mcp-server');
  });
});

describe('getMcpEnvPath', () => {
  it('returns an absolute path ending in .env', () => {
    const envPath = getMcpEnvPath();
    expect(isAbsolute(envPath)).toBe(true);
    expect(envPath.endsWith('.env')).toBe(true);
  });

  it('lives directly under the package root', () => {
    const envPath = getMcpEnvPath();
    const root = getPackageRoot();
    expect(envPath).toBe(join(root, '.env'));
  });
});

describe('getLogsDir', () => {
  it('returns an absolute path ending in logs', () => {
    const logs = getLogsDir();
    expect(isAbsolute(logs)).toBe(true);
    expect(logs.endsWith('logs')).toBe(true);
  });

  it('lives directly under the package root', () => {
    const logs = getLogsDir();
    const root = getPackageRoot();
    expect(logs).toBe(join(root, 'logs'));
  });
});
