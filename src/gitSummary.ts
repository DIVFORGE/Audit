import * as vscode from 'vscode';
import * as fs from 'fs';

interface DailySummary {
  totalEntries: number;
  aiCount: number;
  devCount: number;
  filesTouched: number;
  designChangeCount: number;
}

function summarizeLog(content: string): DailySummary {
  const blocks = content.split(/^## /m).slice(1);
  const files = new Set<string>();
  let aiCount = 0;
  let devCount = 0;
  let designChangeCount = 0;

  for (const block of blocks) {
    const fileMatch = block.match(/^- File: `(.+)`$/m);
    if (fileMatch) files.add(fileMatch[1]);
    if (/^- Mode: AI —/m.test(block)) aiCount++;
    else if (/^- Mode: Developer —/m.test(block)) devCount++;
    if (/^- Design-Change: true/m.test(block)) designChangeCount++;
  }

  return {
    totalEntries: blocks.length,
    aiCount,
    devCount,
    filesTouched: files.size,
    designChangeCount,
  };
}

function formatSummaryLine(summary: DailySummary): string {
  const parts = [`${summary.filesTouched} file${summary.filesTouched === 1 ? '' : 's'}`];
  if (summary.aiCount > 0) parts.push(`${summary.aiCount} AI-assisted edit${summary.aiCount === 1 ? '' : 's'}`);
  if (summary.devCount > 0) parts.push(`${summary.devCount} manual edit${summary.devCount === 1 ? '' : 's'}`);
  if (summary.designChangeCount > 0) {
    parts.push(`${summary.designChangeCount} design change${summary.designChangeCount === 1 ? '' : 's'}`);
  }
  return `Audit: ${parts.join(', ')}`;
}

/**
 * Appends a one-line Audit summary to the active git repository's
 * Source Control commit message box, via the built-in git extension's
 * public API. Never overwrites what the developer already typed.
 */
export async function insertSummaryIntoCommitMessage(todayLogPath: string | undefined) {
  if (!todayLogPath || !fs.existsSync(todayLogPath)) {
    vscode.window.showInformationMessage('Audit: no entries logged yet today.');
    return;
  }

  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (!gitExtension) {
    vscode.window.showWarningMessage('Audit: built-in Git extension not found — cannot access commit message box.');
    return;
  }
  const gitApi = gitExtension.isActive ? gitExtension.exports.getAPI(1) : (await gitExtension.activate()).getAPI(1);

  if (!gitApi.repositories || gitApi.repositories.length === 0) {
    vscode.window.showWarningMessage('Audit: no git repository detected in this workspace.');
    return;
  }

  const repo = gitApi.repositories[0];
  const content = fs.readFileSync(todayLogPath, 'utf8');
  const summary = summarizeLog(content);
  const summaryLine = formatSummaryLine(summary);

  const existing = repo.inputBox.value || '';
  repo.inputBox.value = existing.trim().length > 0 ? `${existing}\n\n${summaryLine}` : summaryLine;

  vscode.window.showInformationMessage('Audit: summary added to commit message.');
}
