export interface ContentJudgement {
  isBlankOnly: boolean;
  isCommentOnly: boolean;
}

const COMMENT_LINE_PATTERNS = [
  /^\/\//,        // //
  /^\/\*/,        // /*
  /^\*/,          // continuation line inside /* */
  /^#/,           // python/shell/yaml
  /^<!--/,        // html
  /^-{2,}/,       // sql / lua-ish
];

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return true; // blank lines don't disqualify a comment block
  return COMMENT_LINE_PATTERNS.some(p => p.test(trimmed));
}

function judgeText(text: string): { blank: boolean; commentish: boolean } {
  if (text.length === 0) return { blank: true, commentish: true };
  const lines = text.split('\n');
  const isBlank = lines.every(l => l.trim().length === 0);
  const isCommentish = lines.every(isCommentLine) && !isBlank;
  return { blank: isBlank, commentish: isCommentish || isBlank };
}

/**
 * Judges a change by looking at BOTH what was removed and what was added.
 * A change only counts as "blank-only" or "comment-only" if every side of
 * it (whatever existed) qualifies — a real code line disqualifies the
 * whole change even if paired with a blank-line removal.
 */
export function judgeContent(removedText: string, insertedText: string): ContentJudgement {
  const removed = judgeText(removedText);
  const inserted = judgeText(insertedText);

  const isBlankOnly = removed.blank && inserted.blank;
  const isCommentOnly = !isBlankOnly && removed.commentish && inserted.commentish;

  return { isBlankOnly, isCommentOnly };
}
