import { Sdk, SdkKnowledge, CanonicalSnippet } from './types.js';
import {
  EXAMPLE_PATHS,
  MANIFEST_FILES,
  rawUrl,
  repoUrl,
} from './github.js';
import { extractInstallSteps, extractKnownIssues, extractDocAnchors } from './parsers/readme.js';
import { parseManifest } from './parsers/manifest.js';
import { readThroughCache } from './cache.js';
import { fetchFirst, fetchText } from './fetcher.js';

/**
 * Load canonical knowledge for an SDK by fetching README, manifest, and a
 * curated set of example files directly from GitHub (raw.githubusercontent).
 * Results are cached with a TTL so repeated tool calls in the same session
 * don't hammer GitHub.
 */
export async function loadKnowledge(sdk: Sdk): Promise<SdkKnowledge | null> {
  return readThroughCache(sdk, async () => {
    const readme = (await fetchText(rawUrl(sdk, 'README.md'))) || '';

    // Load manifest files — first match wins for version.
    const manifestFiles: Record<string, string> = {};
    for (const f of MANIFEST_FILES[sdk]) {
      const body = await fetchText(rawUrl(sdk, f));
      if (body !== null) manifestFiles[f] = body;
    }

    const manifest = parseManifest(sdk, manifestFiles);
    const installSteps = extractInstallSteps(readme);
    const knownIssues = extractKnownIssues(readme);
    const docAnchors = extractDocAnchors(readme);

    // Harvest curated example snippets.
    const snippets: Record<string, CanonicalSnippet> = {};
    const examples = EXAMPLE_PATHS[sdk] || {};
    for (const [key, candidates] of Object.entries(examples)) {
      const hit = await fetchFirst(candidates.map((p) => rawUrl(sdk, p)));
      if (hit) {
        // Record the repo-relative path (strip the raw URL prefix).
        const relPath = hit.url.replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\//, '');
        snippets[key] = { path: relPath, content: hit.body };
      }
    }

    // If nothing loaded at all, treat as unavailable.
    if (!readme && Object.keys(manifestFiles).length === 0 && Object.keys(snippets).length === 0) {
      return null;
    }

    const knowledge: SdkKnowledge = {
      sdk,
      repoRoot: repoUrl(sdk),
      dependencies: manifest.dependencies,
      installSteps,
      knownIssues,
      snippets,
      docAnchors,
      fingerprint: 'github-ttl',
    };
    if (manifest.version) knowledge.version = manifest.version;
    return knowledge;
  });
}
