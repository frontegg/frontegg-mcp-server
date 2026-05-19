/**
 * BMAD-METHOD (Breakthrough Method for Agile AI-Driven Development) phases.
 * Each phase has a persona and a checklist the calling model should honor
 * before emitting output for that phase of work.
 */

export interface BmadPhase {
  id: 'analyst' | 'pm' | 'architect' | 'sm' | 'dev' | 'qa';
  persona: string;
  checklist: string[];
}

export const ANALYST: BmadPhase = {
  id: 'analyst',
  persona: 'Analyst — discovers the real problem, not the stated symptom.',
  checklist: [
    'Restate the user problem in one sentence.',
    'List observable facts separately from assumptions.',
    'Identify which Frontegg SDK repo (of the 5) is canonical.',
  ],
};

export const PM: BmadPhase = {
  id: 'pm',
  persona: 'PM — writes the behavior spec and acceptance criteria.',
  checklist: [
    'State expected behavior in one line: input → output.',
    'List acceptance criteria the fix must satisfy.',
    'Rank findings by severity × blast radius.',
  ],
};

export const ARCHITECT: BmadPhase = {
  id: 'architect',
  persona: 'Architect — chooses the minimal correct shape of the change.',
  checklist: [
    'Consult canonical example/ snippets before generating new config.',
    'Mirror the project’s existing file layout and conventions.',
    'Prefer editing existing files over creating new ones.',
  ],
};

export const SCRUM_MASTER: BmadPhase = {
  id: 'sm',
  persona: 'Scrum Master — turns the spec into concrete, independent stories.',
  checklist: [
    'One finding = one story = one diff.',
    'No bundled, unrelated cleanups.',
    'Each story has a clear Done definition.',
  ],
};

export const DEV: BmadPhase = {
  id: 'dev',
  persona: 'Dev — writes the diff.',
  checklist: [
    'Unified diff only. No free-form prose inside ```diff blocks.',
    'Preserve surrounding formatting and indentation.',
    'Reference the canonicalRef in the diff header comment when possible.',
  ],
};

export const QA: BmadPhase = {
  id: 'qa',
  persona: 'QA — verifies against the spec.',
  checklist: [
    'List the exact command or manual step the developer must run to verify.',
    'Do not claim success without evidence.',
    'Flag residual risks.',
  ],
};

export const BMAD_ALL: BmadPhase[] = [ANALYST, PM, ARCHITECT, SCRUM_MASTER, DEV, QA];

/** Map Frontegg MCP tool names to the BMAD phases they operate in. */
export const TOOL_PHASE_MAP: Record<string, BmadPhase[]> = {
  frontegg_auto: [ANALYST, PM, ARCHITECT, DEV, QA],
  frontegg_analyze_project: [ANALYST, PM],
  frontegg_generate_code: [ARCHITECT, DEV],
  frontegg_validate_setup: [QA],
  frontegg_support: [ANALYST, PM],
  analyze_repo: [ANALYST, PM],
  generate_diffs: [ARCHITECT, DEV],
};
