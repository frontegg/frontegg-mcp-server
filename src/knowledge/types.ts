export type Sdk =
  | 'android-kotlin'
  | 'ios-swift'
  | 'flutter'
  | 'react-native'
  | 'ionic-capacitor';

export interface InstallStep {
  title: string;
  body: string;
  language?: string;
}

export interface KnownIssue {
  id: string;
  title: string;
  body: string;
}

export interface CanonicalSnippet {
  /** Path relative to the canonical repo */
  path: string;
  content: string;
}

export interface SdkKnowledge {
  sdk: Sdk;
  /** GitHub URL of the canonical repo (e.g. https://github.com/frontegg/frontegg-flutter). */
  repoRoot: string;
  /** Current SDK version pulled from the primary manifest */
  version?: string;
  /** Required / peer dependencies parsed out of the manifest */
  dependencies: Record<string, string>;
  /** Install-step code fences harvested from README */
  installSteps: InstallStep[];
  /** "Known Issues" / "Troubleshooting" sections from README */
  knownIssues: KnownIssue[];
  /** Canonical reference snippets from `example/` app (keyed logically) */
  snippets: Record<string, CanonicalSnippet>;
  /** Anchors into the README for deep-linking in diagnose output */
  docAnchors: Record<string, string>;
  /** Fingerprint used for cache invalidation */
  fingerprint: string;
}
