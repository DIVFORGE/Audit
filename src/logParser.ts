import * as fs from 'fs';
import * as path from 'path';

export interface LogEntry {
  date: string; // YYYY-MM-DD, from the log filename
  time: string; // HH:MM:SS
  file: string;
  area: string; // top-level folder of the file path — e.g. "frontend", "backend"
  language: string; // derived from file extension — e.g. "TypeScript", "Java"
  modeRaw: string;
  category: 'ai' | 'developer' | 'external' | 'unclassified';
  toolOrDeveloper: string;
  branch?: string;
  change: string;
  designChange: boolean;
  reason?: string;
}

export function deriveArea(filePath: string): string {
  const normalized = filePath.split(/[\\/]/).filter(Boolean);
  return normalized.length > 1 ? normalized[0] : '(root)';
}

// Extension -> readable language name. Deliberately does NOT attempt to
// guess "frontend" vs "backend" from extension alone — .java, .ts, .kt
// etc. are used on both sides depending on the project, so that judgment
// stays with Project (folder-based). This only answers "what language."
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript (React)',
  js: 'JavaScript', jsx: 'JavaScript (React)', mjs: 'JavaScript', cjs: 'JavaScript',
  vue: 'Vue', svelte: 'Svelte',
  html: 'HTML', htm: 'HTML',
  css: 'CSS', scss: 'SCSS', sass: 'Sass', less: 'Less',
  java: 'Java', kt: 'Kotlin', kts: 'Kotlin',
  cs: 'C#', vb: 'VB.NET',
  py: 'Python', pyi: 'Python',
  go: 'Go',
  rs: 'Rust',
  rb: 'Ruby',
  php: 'PHP',
  c: 'C', h: 'C/C++ Header', cpp: 'C++', cc: 'C++', hpp: 'C++ Header',
  swift: 'Swift', m: 'Objective-C', mm: 'Objective-C++',
  dart: 'Dart',
  sql: 'SQL',
  sh: 'Shell', bash: 'Shell', ps1: 'PowerShell', bat: 'Batch',
  json: 'JSON', yml: 'YAML', yaml: 'YAML', xml: 'XML', toml: 'TOML',
  md: 'Markdown', txt: 'Text',
  dockerfile: 'Dockerfile',
  gradle: 'Gradle', properties: 'Properties',
  env: 'Env Config',
};

export function deriveLanguage(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() || filePath;
  if (/^dockerfile$/i.test(base)) return 'Dockerfile';
  const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
  return EXTENSION_TO_LANGUAGE[ext] || (ext ? ext.toUpperCase() : 'Unknown');
}

function parseBlock(date: string, block: string): LogEntry | null {
  const timeMatch = block.match(/^(\d{2}:\d{2}:\d{2})/);
  const fileMatch = block.match(/^- File: `(.+)`$/m);
  const modeMatch = block.match(/^- Mode: (.+)$/m);
  if (!timeMatch || !fileMatch || !modeMatch) return null;

  const changeMatch = block.match(/^- Change: (.+)$/m);
  const eventMatch = block.match(/^- Event: (.+)$/m);
  // A genuine Audit entry always has EITHER a Change line (edit entry)
  // OR an Event line (create/delete/rename entry) — nothing else. If a
  // block has neither, or has fields we never write (Update:,
  // Validation:, Tests:, etc.), it's not ours — most likely another tool
  // (an AI agent, a different logger) appended into this file directly.
  // Skip it rather than half-parsing it into misleading stats.
  if (!changeMatch && !eventMatch) return null;
  const hasForeignFields = /^- (Update|Validation|Tests|Result|Status|Summary):/m.test(block);
  if (hasForeignFields) return null;

  const branchMatch = block.match(/^- Branch: (.+)$/m);
  const projectMatch = block.match(/^- Project: (.+)$/m);
  const languageMatch = block.match(/^- Language: (.+)$/m);
  const designMatch = /^- Design-Change: true/m.test(block);
  const reasonMatch = block.match(/^- Reason: (.+)$/m);

  const modeRaw = modeMatch[1];
  let category: LogEntry['category'] = 'unclassified';
  let toolOrDeveloper = '';
  if (modeRaw.startsWith('AI —')) {
    category = 'ai';
    toolOrDeveloper = modeRaw.replace(/^AI — /, '').replace(/\s*\(corrected\)$/, '');
  } else if (modeRaw.startsWith('Developer —')) {
    category = 'developer';
    toolOrDeveloper = modeRaw.replace(/^Developer — /, '').replace(/\s*\(corrected\)$/, '');
  } else if (modeRaw.startsWith('External paste')) {
    category = 'external';
    toolOrDeveloper = 'External';
  }

  return {
    date,
    time: timeMatch[1],
    file: fileMatch[1],
    area: projectMatch ? projectMatch[1] : deriveArea(fileMatch[1]),
    language: languageMatch ? languageMatch[1] : deriveLanguage(fileMatch[1]),
    modeRaw,
    category,
    toolOrDeveloper,
    branch: branchMatch ? branchMatch[1] : undefined,
    change: changeMatch ? changeMatch[1] : '',
    designChange: designMatch,
    reason: reasonMatch ? reasonMatch[1] : undefined,
  };
}

export function parseLogFile(filePath: string): LogEntry[] {
  const dateMatch = path.basename(filePath).match(/^(\d{4}-\d{2}-\d{2})\.md$/);
  const date = dateMatch ? dateMatch[1] : path.basename(filePath);
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const blocks = content.split(/^## /m).slice(1);
  const entries: LogEntry[] = [];
  for (const block of blocks) {
    const entry = parseBlock(date, block);
    if (entry) entries.push(entry);
  }
  return entries;
}

export function parseAllLogs(logFolder: string): LogEntry[] {
  if (!fs.existsSync(logFolder)) return [];
  const files = fs
    .readdirSync(logFolder)
    .filter(f => f.endsWith('.md'))
    .sort();
  let all: LogEntry[] = [];
  for (const f of files) {
    all = all.concat(parseLogFile(path.join(logFolder, f)));
  }
  return all;
}
