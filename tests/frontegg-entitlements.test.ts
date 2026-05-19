/**
 * Tests for Category G — Frontegg entitlements + plans tools.
 *
 * The tools call the shared `fronteggApi()` HTTP helper. We mock it via
 * `jest.mock` to avoid network calls, and assert:
 *   - JSON Schema shape (required fields, descriptions)
 *   - zod validation (rejects bad input)
 *   - happy-path HTTP flow + response formatting
 *   - error path (FronteggApiError → wrapped tool result)
 *   - attach behavior: primary POST 404 falls back to PATCH, re-GETs state
 */

import { jest } from '@jest/globals';

// Mock the API client before importing the tools.
const fronteggApiMock = jest.fn() as jest.MockedFunction<
  (opts: unknown) => Promise<unknown>
>;

jest.mock('../src/tools/frontegg-api-client.js', () => {
  class FronteggApiError extends Error {
    constructor(message: string, public readonly status: number) {
      super(message);
      this.name = 'FronteggApiError';
    }
  }
  return {
    fronteggApi: fronteggApiMock,
    FronteggApiError,
    clearTokenCache: jest.fn(),
  };
});

import {
  handleFeaturesList,
  handleFeaturesCreate,
  handlePlansList,
  handlePlanFeatureAttach,
  FEATURES_LIST_TOOL,
  FEATURES_CREATE_TOOL,
  PLANS_LIST_TOOL,
  PLAN_FEATURE_ATTACH_TOOL,
  FronteggEntitlementsTools,
} from '../src/tools/frontegg-entitlements.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { FronteggApiError } from '../src/tools/frontegg-api-client.js';

beforeEach(() => {
  fronteggApiMock.mockReset();
});

describe('tool definitions', () => {
  test('all four tools have name + inputSchema + description', () => {
    const tools = [
      FEATURES_LIST_TOOL,
      FEATURES_CREATE_TOOL,
      PLANS_LIST_TOOL,
      PLAN_FEATURE_ATTACH_TOOL,
    ];
    for (const t of tools) {
      expect(t.name).toMatch(/^frontegg_/);
      expect(typeof t.description).toBe('string');
      expect(t.description!.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe('object');
    }
    // Required fields encoded
    expect(FEATURES_CREATE_TOOL.inputSchema.required).toEqual(['key', 'name']);
    expect(PLAN_FEATURE_ATTACH_TOOL.inputSchema.required).toEqual([
      'planId',
      'featureIds',
    ]);
  });

  test('FronteggEntitlementsTools.register adds 4 tools', () => {
    const reg = new ToolRegistry();
    new FronteggEntitlementsTools().register(reg);
    expect(reg.names()).toEqual(
      expect.arrayContaining([
        'frontegg_features_list',
        'frontegg_features_create',
        'frontegg_plans_list',
        'frontegg_plan_feature_attach',
      ])
    );
    expect(reg.names()).toHaveLength(4);
  });
});

describe('frontegg_features_list', () => {
  test('happy path: returns the items array as formatted JSON', async () => {
    fronteggApiMock.mockResolvedValueOnce({
      items: [
        {
          id: 'feat-1',
          key: 'k1',
          name: 'Feature One',
          description: 'd',
          permissions: [],
        },
      ],
      hasNext: false,
    });
    const res = await handleFeaturesList({});
    expect(fronteggApiMock).toHaveBeenCalledWith({
      method: 'GET',
      path: '/entitlements/resources/features/v1',
    });
    const text = res.content[0]?.text ?? '';
    expect(text).toContain('Frontegg Features (1)');
    expect(text).toContain('feat-1');
    expect(text).toContain('Feature One');
  });

  test('passes pagination params through as query string', async () => {
    fronteggApiMock.mockResolvedValueOnce({ items: [], hasNext: false });
    await handleFeaturesList({ limit: 50, offset: 100 });
    expect(fronteggApiMock).toHaveBeenCalledWith({
      method: 'GET',
      path: '/entitlements/resources/features/v1?_limit=50&_offset=100',
    });
  });

  test('formats FronteggApiError into tool result without throwing', async () => {
    fronteggApiMock.mockRejectedValueOnce(
      new FronteggApiError('boom', 401)
    );
    const res = await handleFeaturesList({});
    const text = res.content[0]?.text ?? '';
    expect(text).toContain('Frontegg API error (401)');
    expect(text).toContain('boom');
  });
});

describe('frontegg_features_create', () => {
  test('happy path: posts canonical body and returns created feature', async () => {
    fronteggApiMock.mockResolvedValueOnce({
      id: 'new-id',
      key: 'mcp_smoke_x',
      name: 'mcp-smoke-x',
    });
    const res = await handleFeaturesCreate({
      key: 'mcp_smoke_x',
      name: 'mcp-smoke-x',
      description: 'smoke',
    });
    expect(fronteggApiMock).toHaveBeenCalledWith({
      method: 'POST',
      path: '/entitlements/resources/features/v1',
      body: {
        key: 'mcp_smoke_x',
        name: 'mcp-smoke-x',
        description: 'smoke',
      },
    });
    const text = res.content[0]?.text ?? '';
    expect(text).toContain('Feature Created');
    expect(text).toContain('new-id');
  });

  test('rejects missing required fields via zod', async () => {
    const res = await handleFeaturesCreate({ key: 'x' }); // name missing
    expect(fronteggApiMock).not.toHaveBeenCalled();
    const text = res.content[0]?.text ?? '';
    // zod error message lands in the "❌ Error:" branch
    expect(text).toContain('Error');
  });

  test('passes optional permissions + metadata through unchanged', async () => {
    fronteggApiMock.mockResolvedValueOnce({ id: 'id-2' });
    await handleFeaturesCreate({
      key: 'k',
      name: 'n',
      permissions: ['fe.secure.read.users'],
      metadata: { tier: 'gold' },
    });
    const [arg] = fronteggApiMock.mock.calls[0] as [
      { body: Record<string, unknown> },
    ];
    expect(arg.body.permissions).toEqual(['fe.secure.read.users']);
    expect(arg.body.metadata).toEqual({ tier: 'gold' });
  });
});

describe('frontegg_plans_list', () => {
  test('happy path: returns items', async () => {
    fronteggApiMock.mockResolvedValueOnce({
      items: [{ id: 'plan-1', name: 'Pro' }],
      hasNext: false,
    });
    const res = await handlePlansList({});
    expect(fronteggApiMock).toHaveBeenCalledWith({
      method: 'GET',
      path: '/entitlements/resources/plans/v1',
    });
    const text = res.content[0]?.text ?? '';
    expect(text).toContain('Frontegg Plans (1)');
    expect(text).toContain('plan-1');
    expect(text).toContain('Pro');
  });

  test('handles empty list', async () => {
    fronteggApiMock.mockResolvedValueOnce({ items: [], hasNext: false });
    const res = await handlePlansList({});
    const text = res.content[0]?.text ?? '';
    expect(text).toContain('Frontegg Plans (0)');
  });
});

describe('frontegg_plan_feature_attach', () => {
  test('happy path: POST succeeds, re-GETs features, confirms attach', async () => {
    // 1st call: POST attach (resolves OK)
    fronteggApiMock.mockResolvedValueOnce(undefined);
    // 2nd call: GET plan features
    fronteggApiMock.mockResolvedValueOnce({
      items: [{ id: 'feat-1', key: 'k', name: 'F' }],
      hasNext: false,
    });

    const res = await handlePlanFeatureAttach({
      planId: 'plan-1',
      featureIds: ['feat-1'],
    });

    expect(fronteggApiMock).toHaveBeenCalledTimes(2);
    expect(fronteggApiMock.mock.calls[0]?.[0]).toEqual({
      method: 'POST',
      path: '/entitlements/resources/plans/v1/plan-1/features',
      body: { featureIds: ['feat-1'] },
    });
    expect(fronteggApiMock.mock.calls[1]?.[0]).toEqual({
      method: 'GET',
      path: '/entitlements/resources/plans/v1/plan-1/features',
    });
    const text = res.content[0]?.text ?? '';
    expect(text).toContain('All 1 feature(s) confirmed attached.');
    expect(text).toContain('feat-1');
  });

  test('primary POST 404 falls through to PATCH, then re-GET surfaces no-op', async () => {
    // 1st call: POST 404
    fronteggApiMock.mockRejectedValueOnce(
      new FronteggApiError('not found', 404)
    );
    // 2nd call: PATCH 200 (silently no-op on this tenant)
    fronteggApiMock.mockResolvedValueOnce(undefined);
    // 3rd call: GET features — still empty
    fronteggApiMock.mockResolvedValueOnce({ items: [], hasNext: false });

    const res = await handlePlanFeatureAttach({
      planId: 'plan-x',
      featureIds: ['feat-x'],
    });

    expect(fronteggApiMock).toHaveBeenCalledTimes(3);
    expect(fronteggApiMock.mock.calls[1]?.[0]).toEqual({
      method: 'PATCH',
      path: '/entitlements/resources/plans/v1/plan-x',
      body: { featureIds: ['feat-x'] },
    });
    const text = res.content[0]?.text ?? '';
    expect(text).toContain('fallback PATCH used');
    expect(text).toContain('1 of 1 feature(s) not visible after attach');
  });

  test('rejects empty featureIds via zod (no API call)', async () => {
    const res = await handlePlanFeatureAttach({
      planId: 'plan-1',
      featureIds: [],
    });
    expect(fronteggApiMock).not.toHaveBeenCalled();
    expect(res.content[0]?.text).toMatch(/Error/);
  });

  test('propagates non-404 errors from the primary POST', async () => {
    fronteggApiMock.mockRejectedValueOnce(
      new FronteggApiError('forbidden', 403)
    );
    const res = await handlePlanFeatureAttach({
      planId: 'plan-1',
      featureIds: ['feat-1'],
    });
    expect(fronteggApiMock).toHaveBeenCalledTimes(1);
    const text = res.content[0]?.text ?? '';
    expect(text).toContain('Frontegg API error (403)');
  });
});
