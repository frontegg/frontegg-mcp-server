import { ALL_PRINCIPLES } from './godmode-principles.js';
import { TOOL_PHASE_MAP, BmadPhase } from './bmad-method.js';

/**
 * Produce the BMAD/godmode preamble that should be prefixed to each tool's
 * MCP description so the calling model is constrained before it even sees
 * the tool's inputs.
 */
export function toolDescriptionPreamble(toolName: string): string {
  const phases = TOOL_PHASE_MAP[toolName] || [];
  const phaseLine = phases.length
    ? `BMAD phases: ${phases.map((p) => p.id).join(' → ')}.`
    : '';
  const principleLine =
    'Operating principles: spec-first, reference-engine (cite canonical SDK repo), pattern-matching, fault-diagnosis, comprehension-check, completion-gate, security-protocol.';
  return [
    '[BMAD+godmode]',
    phaseLine,
    principleLine,
    'Never claim "fixed" without an Evidence block. Prefer canonical example/ snippets over invented config.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Full principle dump used by tool responses for model self-checking. */
export function principleChecklist(): string {
  return ALL_PRINCIPLES.map((p, i) => `${i + 1}. ${p}`).join('\n');
}

/** Checklist for a specific tool's BMAD phases. */
export function phaseChecklist(toolName: string): string {
  const phases = TOOL_PHASE_MAP[toolName] || [];
  return phases
    .map((p: BmadPhase) => `### ${p.persona}\n- ${p.checklist.join('\n- ')}`)
    .join('\n\n');
}

/**
 * Prepend a preamble to an existing tool description. Safe to call multiple
 * times — it replaces any previous [BMAD+godmode] block rather than stacking.
 */
export function withPreamble(toolName: string, description: string): string {
  const existing = description.replace(/\[BMAD\+godmode\][\s\S]*?(?=\n\n|$)/, '').trim();
  return `${toolDescriptionPreamble(toolName)}\n\n${existing}`;
}
