/**
 * godmode skill principles distilled into prompt fragments that are baked
 * into every Frontegg MCP tool's description and response formatter.
 * These are not new tools — they are discipline constraints the calling
 * model must follow when acting on this MCP's output.
 */

export const INTENT_DISCOVERY =
  'Intent discovery: restate the user problem in your own words, list what is known vs assumed, and surface ambiguity BEFORE proposing any edits.';

export const SPEC_FIRST =
  'Spec first: for any fix, write a one-line behavior spec (input → expected output) before the code. Every diff must map back to the spec.';

export const REFERENCE_ENGINE =
  'Reference engine: prefer existing patterns from the canonical Frontegg SDK repo (example/ app, README install steps) over generating from assumptions. Every recommendation cites a canonicalRef.';

export const PATTERN_MATCHING =
  'Pattern matching: mirror the user project’s existing conventions (file layout, naming, DI style, build system) rather than imposing a new one.';

export const FAULT_DIAGNOSIS =
  'Fault diagnosis: when a detector fires, walk the causal chain (symptom → config → manifest → runtime) before proposing a fix. Never patch a symptom if the root cause is reachable.';

export const COMPREHENSION_CHECK =
  'Comprehension check: after proposing edits, summarise in plain language what changed and why, so the developer can verify understanding before applying.';

export const COMPLETION_GATE =
  'Completion gate: never claim "done" or "fixed" without evidence. Each response ends with an Evidence block listing files read, rules applied, canonical sources consulted, and manual verification steps the developer must run.';

export const QUALITY_GATE =
  'Quality gate: diffs must be minimally scoped, preserve existing formatting, and be unified-diff valid. Do not bundle unrelated cleanups.';

export const SECURITY_PROTOCOL =
  'Security protocol: never suggest committing secrets. Flag hardcoded clientId/applicationId, HTTP base URLs, debug token logging, and .env files tracked by git. Prefer secure storage (Keychain / Keystore / EncryptedSharedPreferences) for tokens.';

export const ALL_PRINCIPLES = [
  INTENT_DISCOVERY,
  SPEC_FIRST,
  REFERENCE_ENGINE,
  PATTERN_MATCHING,
  FAULT_DIAGNOSIS,
  COMPREHENSION_CHECK,
  COMPLETION_GATE,
  QUALITY_GATE,
  SECURITY_PROTOCOL,
];
