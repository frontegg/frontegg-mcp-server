import path from 'path';
import { Finding } from './types.js';
import { ALL_DETECTORS, detectCommonIssues, getDetector } from './platforms/common-detector.js';
import {
  ALL_DIFF_GENERATORS,
  commonDiff,
} from './diffs/index.js';
import { loadKnowledge, Sdk, SdkKnowledge, diagnose } from '../knowledge/index.js';
import { Logger } from '../utils/logger.js';

export interface DispatchResult {
  findings: Finding[];
  /** SDK detectors that matched the project — used for evidence block. */
  matchedSdks: Sdk[];
  /** Knowledge bundles loaded from the canonical repos, keyed by sdk. */
  knowledge: Partial<Record<Sdk, SdkKnowledge>>;
}

const logger = Logger.getInstance();

/** Detect matching SDKs, load canonical knowledge for each, run detectors, enrich. */
export async function analyze(
  rootPath: string,
  preferredSdk?: Sdk
): Promise<DispatchResult> {
  const root = path.resolve(rootPath);
  const matched: Sdk[] = [];
  const knowledgeMap: Partial<Record<Sdk, SdkKnowledge>> = {};
  const findings: Finding[] = [];

  const detectors = preferredSdk
    ? [getDetector(preferredSdk)].filter(Boolean) as typeof ALL_DETECTORS
    : ALL_DETECTORS;

  for (const detector of detectors) {
    let applicable = false;
    try {
      applicable = await detector.matches(root);
    } catch (err) {
      logger.debug('detector.matches failed', { sdk: detector.sdk, err: String(err) });
    }
    if (!applicable) continue;
    matched.push(detector.sdk);

    let knowledge: SdkKnowledge | null = null;
    try {
      knowledge = await loadKnowledge(detector.sdk);
      if (knowledge) knowledgeMap[detector.sdk] = knowledge;
    } catch (err) {
      logger.warn('loadKnowledge failed', { sdk: detector.sdk, err: String(err) });
    }

    try {
      const raw = await detector.detect(root, knowledge);
      const enriched = diagnose(
        raw.map((f) => ({ ...f, sdk: f.sdk || detector.sdk })),
        knowledge
      );
      findings.push(...enriched);
    } catch (err) {
      logger.warn('detector.detect failed', { sdk: detector.sdk, err: String(err) });
    }
  }

  // Always append common (env/security) findings.
  try {
    findings.push(...(await detectCommonIssues(root)));
  } catch (err) {
    logger.debug('detectCommonIssues failed', { err: String(err) });
  }

  return { findings, matchedSdks: matched, knowledge: knowledgeMap };
}

/** Generate diffs for a list of finding ids using the per-SDK diff registry. */
export async function generateDiffs(
  rootPath: string,
  findingIds: string[],
  knowledgeMap: Partial<Record<Sdk, SdkKnowledge>> = {}
): Promise<Array<{ id: string; diff: string }>> {
  const root = path.resolve(rootPath);
  const out: Array<{ id: string; diff: string }> = [];

  for (const id of findingIds) {
    let diff: string | null = null;

    if (id.startsWith('common.')) {
      diff = await commonDiff(root, id);
    } else {
      // Try each SDK-specific generator; first to return a diff wins.
      for (const gen of ALL_DIFF_GENERATORS) {
        try {
          const k = knowledgeMap[gen.sdk] || (await loadKnowledge(gen.sdk));
          diff = await gen.generate(root, id, k);
          if (diff) break;
        } catch (err) {
          logger.debug('diff generator failed', { sdk: gen.sdk, id, err: String(err) });
        }
      }
    }
    if (diff) out.push({ id, diff });
  }
  return out;
}
