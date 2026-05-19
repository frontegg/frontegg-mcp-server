import { InstallStep, KnownIssue } from '../types.js';

/**
 * Extract install-step code fences from the README. Sections whose header
 * matches install/setup/getting-started/configuration are considered.
 */
export function extractInstallSteps(readme: string): InstallStep[] {
  const sections = splitByHeading(readme);
  const result: InstallStep[] = [];
  const installRx = /install|setup|getting[-\s]*started|configuration|quick[-\s]*start|integration/i;
  for (const s of sections) {
    if (!installRx.test(s.heading)) continue;
    const fences = extractCodeFences(s.body);
    for (const f of fences) {
      result.push({
        title: s.heading.trim(),
        body: f.code.trim(),
        language: f.language,
      });
    }
  }
  return result;
}

/** Extract "Known Issues" / "Troubleshooting" / "FAQ" sections. */
export function extractKnownIssues(readme: string): KnownIssue[] {
  const sections = splitByHeading(readme);
  const matchRx = /known[-\s]*issue|troubleshoot|faq|common[-\s]*problem|debug/i;
  const result: KnownIssue[] = [];
  for (const s of sections) {
    if (!matchRx.test(s.heading)) continue;
    // Split the body by any nested sub-heading so each issue becomes its own entry.
    const subs = splitByHeading(s.body, 4);
    if (subs.length === 0) {
      result.push({
        id: slugify(s.heading),
        title: s.heading.trim(),
        body: s.body.trim(),
      });
    } else {
      for (const sub of subs) {
        result.push({
          id: slugify(sub.heading),
          title: sub.heading.trim(),
          body: sub.body.trim(),
        });
      }
    }
  }
  return result;
}

/** Build a map of heading slug -> anchor href for deep-linking. */
export function extractDocAnchors(readme: string): Record<string, string> {
  const anchors: Record<string, string> = {};
  const sections = splitByHeading(readme);
  for (const s of sections) {
    const slug = slugify(s.heading);
    if (slug) anchors[slug] = `#${slug}`;
  }
  return anchors;
}

interface Section {
  heading: string;
  body: string;
}

function splitByHeading(md: string, maxLevel: number = 6): Section[] {
  const lines = md.split(/\r?\n/);
  const sections: Section[] = [];
  let current: Section | null = null;
  const headingRx = new RegExp(`^(#{1,${maxLevel}})\\s+(.+)$`);
  for (const line of lines) {
    const m = headingRx.exec(line);
    if (m) {
      if (current) sections.push(current);
      current = { heading: m[2] ?? '', body: '' };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) sections.push(current);
  return sections;
}

function extractCodeFences(md: string): Array<{ language?: string; code: string }> {
  const result: Array<{ language?: string; code: string }> = [];
  const rx = /```([^\n`]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(md)) !== null) {
    const lang = (m[1] ?? '').trim() || undefined;
    const code = m[2] ?? '';
    const entry: { language?: string; code: string } = { code };
    if (lang) entry.language = lang;
    result.push(entry);
  }
  return result;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}
