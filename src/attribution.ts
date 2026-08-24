import * as vscode from 'vscode';

/**
 * Known AI coding-assistant extensions we can reliably detect as "active"
 * in the workspace. Extend this map as new tools are installed.
 * Detection here means: "this extension is installed and enabled" —
 * combined with edit-shape heuristics in classifyEdit() to guess
 * which one likely produced a given change.
 */
const KNOWN_AI_EXTENSIONS: { id: string; label: string }[] = [
  { id: 'github.copilot', label: 'GitHub Copilot' },
  { id: 'github.copilot-chat', label: 'GitHub Copilot Chat' },
  { id: 'anthropic.claude-code', label: 'Claude Code' },
  { id: 'continue.continue', label: 'Continue' },
  { id: 'codeium.codeium', label: 'Codeium' },
  { id: 'cursor.cursor', label: 'Cursor' },
  { id: 'tabnine.tabnine-vscode', label: 'Tabnine' },
  { id: 'openai.chatgpt', label: 'Codex (OpenAI)' },
  { id: 'google.geminicodeassist', label: 'Gemini Code Assist' },
];

export interface ActiveAITool {
  id: string;
  label: string;
}

export function getActiveAITools(): ActiveAITool[] {
  return KNOWN_AI_EXTENSIONS.filter(tool => {
    const ext = vscode.extensions.getExtension(tool.id);
    return ext !== undefined && ext.isActive;
  });
}

export type EditSource =
  | { mode: 'ai-likely'; tool: string }
  | { mode: 'manual' }
  | { mode: 'external-paste' }
  | { mode: 'unknown' };

export interface EditShape {
  insertedLineCount: number;
  insertedCharCount: number;
  isSingleContiguousInsert: boolean;
  replacedExistingText: boolean;
  msSinceLastKeystroke: number;
}

/**
 * Heuristic classification of a single edit event.
 *
 * Honest limitations (documented deliberately, not hidden):
 * - We can only name a SPECIFIC tool (Copilot, Claude Code, etc.) when
 *   exactly one AI extension is active AND the edit shape looks like an
 *   accepted suggestion (multi-line, near-instant, not preceded by
 *   steady keystrokes).
 * - If multiple AI extensions are active simultaneously, we cannot
 *   distinguish which one produced the edit — logged as "ai-likely"
 *   with a list of candidates rather than a false single attribution.
 * - Content pasted from a browser-based chat (ChatGPT web, Gemini web,
 *   Claude web) is NOT distinguishable from a manual large paste. It is
 *   logged as "external-paste", never guessed as a specific model.
 */
export function classifyEdit(shape: EditShape, activeTools: ActiveAITool[]): EditSource {
  const looksLikeAcceptedSuggestion =
    shape.isSingleContiguousInsert &&
    shape.insertedLineCount >= 2 &&
    shape.msSinceLastKeystroke > 800; // long pause then a chunk appears = likely a Tab-accept, not typing

  if (looksLikeAcceptedSuggestion) {
    if (activeTools.length === 1) {
      return { mode: 'ai-likely', tool: activeTools[0].label };
    }
    if (activeTools.length > 1) {
      return { mode: 'ai-likely', tool: `possibly: ${activeTools.map(t => t.label).join(' / ')}` };
    }
    // Multi-line chunk appeared with no known AI extension active —
    // most likely pasted from an external source (browser chat, docs, etc.)
    return { mode: 'external-paste' };
  }

  if (shape.insertedCharCount <= 1 || shape.msSinceLastKeystroke < 800) {
    return { mode: 'manual' };
  }

  return { mode: 'unknown' };
}
