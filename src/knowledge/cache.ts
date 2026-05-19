import { Sdk, SdkKnowledge } from './types.js';

interface CacheEntry {
  expiresAt: number;
  knowledge: SdkKnowledge | null;
}

const cache = new Map<Sdk, CacheEntry>();

/** TTL for knowledge freshness against GitHub. Override with FRONTEGG_KNOWLEDGE_TTL_MS. */
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

function ttlMs(): number {
  const v = Number(process.env.FRONTEGG_KNOWLEDGE_TTL_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TTL_MS;
}

export async function readThroughCache(
  sdk: Sdk,
  produce: () => Promise<SdkKnowledge | null>
): Promise<SdkKnowledge | null> {
  const now = Date.now();
  const hit = cache.get(sdk);
  if (hit && hit.expiresAt > now) {
    return hit.knowledge;
  }
  try {
    const knowledge = await produce();
    cache.set(sdk, { expiresAt: now + ttlMs(), knowledge });
    return knowledge;
  } catch {
    // On fetch failure, serve stale entry if we have one; otherwise null.
    if (hit) return hit.knowledge;
    cache.set(sdk, { expiresAt: now + 60_000, knowledge: null });
    return null;
  }
}

export function invalidateKnowledgeCache(sdk?: Sdk): void {
  if (sdk) cache.delete(sdk);
  else cache.clear();
}
