// Dev tool: rebuild docs/PROMPTS.md from a Claude Code session transcript: every prompt the human typed, and
// every brief handed to a data agent (spawn prompts and team-lead's follow-up assignments).
// usage: npx tsx scripts/dev/prompts.ts <session.jsonl>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const file = process.argv[2];
if (!file) throw new Error('usage: prompts.ts <session.jsonl>');

interface Entry {
  at: string;
  text: string;
}
const human: Entry[] = [];
const briefs: { at: string; to: string; text: string; kind: 'spawn' | 'assignment' }[] = [];
const seen = new Set<string>();

const clean = (s: string) =>
  s
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/\[Image: source: [^\]]*\]/g, '[screenshot]')
    .replace(/\[Image #\d+\]/g, '[image]')
    .trim();
/** Names that must not be published (one per line in the gitignored .redact file at the repo root). */
const redactFile = join(import.meta.dirname, '..', '..', '.redact');
const redactions = existsSync(redactFile)
  ? readFileSync(redactFile, 'utf8')
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => new RegExp(`(?<![\\w-])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'gi'))
  : [];
/** Local paths mean nothing to readers (and name the author's machine): make them repo-relative. */
const scrub = (s: string) =>
  redactions.reduce(
    (out, re) => out.replace(re, '[redacted]'),
    s.replace(/\/Users\/[^/\s]+\/Code\/[^\s)'"`]*?trainmapper\/?/g, './').replace(/\/private\/tmp\/claude-\d+\/[^\s)'"`]*\/scratchpad\/?/g, '<scratchpad>/'),
  );
const fromAgent = (s: string) => /^Another Claude session sent a message|<teammate-message|<agent-message|<task-notification/.test(s);

for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line) continue;
  let o: any;
  try {
    o = JSON.parse(line);
  } catch {
    continue;
  }
  const at: string = o.timestamp ?? '';
  const push = (raw: string) => {
    const t = clean(raw);
    if (!t || t.startsWith('<') || fromAgent(t) || t.includes('This session is being continued') || t.startsWith('Caveat:')) return;
    const k = t.slice(0, 200);
    if (seen.has(k)) return;
    seen.add(k);
    human.push({ at, text: t });
  };
  if (o.type === 'user' && o.message?.role === 'user' && !o.isMeta && !o.isCompactSummary) {
    const c = o.message.content;
    if (typeof c === 'string') push(c);
    else if (Array.isArray(c) && !c.some((x: any) => x?.type === 'tool_result')) for (const x of c) if (x?.type === 'text') push(x.text);
  }
  // Messages typed while Claude was mid-task arrive as queued commands.
  if (o.type === 'attachment' && o.attachment?.type === 'queued_command') {
    const p = o.attachment.prompt ?? o.attachment.content;
    if (typeof p === 'string') push(p);
    else if (Array.isArray(p)) for (const x of p) if (x?.type === 'text') push(x.text);
  }
  if (o.type === 'assistant') {
    for (const x of o.message?.content ?? []) {
      if (x?.type !== 'tool_use') continue;
      if (x.name === 'Agent' || x.name === 'Task') briefs.push({ at, to: x.input.name ?? x.input.description, text: x.input.prompt ?? '', kind: 'spawn' });
      if (x.name === 'SendMessage' && typeof x.input.message === 'string' && x.input.message.length > 400)
        briefs.push({ at, to: x.input.to, text: x.input.message, kind: 'assignment' });
    }
  }
}

human.sort((a, b) => a.at.localeCompare(b.at));
const day = (s: string) => s.slice(0, 16).replace('T', ' ');
const quote = (s: string) =>
  s
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
const md = `# How Tiny Trains was made

Tiny Trains was built in one long Claude Code session with Claude (Opus 5.5), which coordinated a team of
background data agents: one per city or group of cities, plus geography agents. This file is the record of that:
every prompt the human wrote, in order, and every brief the agents were given. The shared contract they all worked
to is [DATA_BRIEF.md](DATA_BRIEF.md); the pipelines they share are documented in [KIT_GTFS.md](KIT_GTFS.md) and
[KIT_SIM.md](KIT_SIM.md).

Typos are left as typed. Screenshots and reference images that came with a prompt are marked [screenshot]/[image].

## The human's prompts

${human.map((h, i) => `### ${i + 1}. ${day(h.at)} UTC\n\n${quote(scrub(h.text))}`).join('\n\n')}

## Briefs given to agents

${briefs.map((b) => `### ${b.to} (${b.kind === 'spawn' ? 'new agent' : 'assignment'}, ${day(b.at)} UTC)\n\n\`\`\`\`text\n${scrub(b.text.trim())}\n\`\`\`\``).join('\n\n')}
`;
const out = join(import.meta.dirname, '..', '..', 'docs', 'PROMPTS.md');
writeFileSync(out, md);
console.log(`wrote ${out}: ${human.length} prompts, ${briefs.length} briefs`);
