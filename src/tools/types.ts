import type { Sdk } from '../knowledge/types.js';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type Platform =
  | 'android'
  | 'ios'
  | 'common'
  | 'flutter'
  | 'react-native'
  | 'ionic-capacitor';

export interface Finding {
  id: string;
  rule_id: string;
  title: string;
  severity: Severity;
  file_path?: string;
  start_line?: number;
  end_line?: number;
  why: string;
  suggested_fix: string;
  platform: Platform;
  sdk?: Sdk;
  /** Logical flow bucket (deep-link, init, auth, security, build, env). */
  flow?: string;
}

export interface RuleMeta {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  platforms: Platform[];
  sdk?: Sdk[];
  flow?: string;
  /** Human-readable "why this matters / how to verify". */
  troubleshooting?: string;
  /** Anchor into the canonical README section. */
  docAnchor?: string;
}
