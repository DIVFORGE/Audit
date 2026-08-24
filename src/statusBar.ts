import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let statusBarItem: vscode.StatusBarItem | undefined;

export function initStatusBar(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'audit.openLog';
  statusBarItem.tooltip = 'Audit — AI vs manual edits today for this file (click to open log)';
  context.subscriptions.push(statusBarItem);
}

/**
 * Recomputes counts by scanning today's log for entries whose File line
 * matches relativePath. Parsing the log rather than keeping an in-memory
 * counter means the number is always correct even after manual
 * corrections or if the extension host restarts mid-day.
 */
export function refreshStatusBar(logFilePath: string | undefined, relativePath: string | undefined) {
  if (!statusBarItem) return;

  if (!logFilePath || !relativePath || !fs.existsSync(logFilePath)) {
    statusBarItem.hide();
    return;
  }

  let content: string;
  try {
    content = fs.readFileSync(logFilePath, 'utf8');
  } catch {
    statusBarItem.hide();
    return;
  }

  const escapedPath = relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fileLinePattern = new RegExp('^- File: `' + escapedPath + '`$', 'm');

  const blocks = content.split(/^## /m).slice(1);
  let aiCount = 0;
  let devCount = 0;

  for (const block of blocks) {
    if (!fileLinePattern.test(block)) continue;
    if (/^- Mode: AI —/m.test(block)) aiCount++;
    else if (/^- Mode: Developer —/m.test(block)) devCount++;
  }

  if (aiCount === 0 && devCount === 0) {
    statusBarItem.hide();
    return;
  }

  statusBarItem.text = `$(circuit-board) AI ${aiCount} · $(person) Dev ${devCount}`;
  statusBarItem.show();
}
