import { Finding } from '../types.js';
import { Sdk, SdkKnowledge } from '../../knowledge/types.js';

export interface PlatformDetector {
  sdk: Sdk;
  /** Quick probe of the project root — does this SDK apply? */
  matches(root: string): Promise<boolean>;
  /** Deep scan — runs only when matches() is true. */
  detect(root: string, knowledge: SdkKnowledge | null): Promise<Finding[]>;
}

export interface DiffGenerator {
  sdk: Sdk;
  /** Produce a diff for a finding id, or null if this SDK doesn't own the id. */
  generate(
    root: string,
    findingId: string,
    knowledge: SdkKnowledge | null
  ): Promise<string | null>;
}
