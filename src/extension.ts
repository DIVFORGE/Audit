import * as vscode from 'vscode';
import * as path from 'path';
import { classifyEdit, getActiveAITools, EditShape } from './attribution';
import { appendLogEntry, getTodayLogPath, getLogFolderPath } from './logger';
import { detectDesignChange } from './designChange';
import { judgeContent } from './contentJudge';
import { flashEditDecoration } from './decorations';
import { initStatusBar, refreshStatusBar } from './statusBar';
import { correctLastEntry, LastEntryRef } from './correction';
import { insertSummaryIntoCommitMessage } from './gitSummary';
import { addReasonToLastEntry } from './reason';
import { openDashboard } from './dashboard';
import { exportLogToCsv } from './csvExport';
import { getCurrentGitBranch } from './branch';
import { registerFileEventTracking } from './fileEvents';
import { registerIntegrityProtection } from './integrity';

let lastKeystrokeTime = Date.now();
let trackingEnabled = true;
let lastEntry: LastEntryRef | undefined;

// Caches each open document's full text as it was BEFORE the most recent
// change event, so we can look up what a deleted range actually contained
// (VS Code's change events only give the new inserted text and a range —
// not the text that was removed — so we have to track it ourselves).
const docTextCache = new Map<string, string>();

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('audit');
  trackingEnabled = config.get<boolean>('enabled', true);

  ensureDeveloperNameSet(context);
  initStatusBar(context);

  const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (!editor) return;
    const wsFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    const relPath = wsFolder ? path.relative(wsFolder.uri.fsPath, editor.document.uri.fsPath) : undefined;
    refreshStatusBar(getTodayLogPath(wsFolder?.uri.fsPath), relPath?.split(path.sep).join('/'));
  });

  // Seed the cache for any files already open when the extension activates.
  for (const doc of vscode.workspace.textDocuments) {
    docTextCache.set(doc.uri.toString(), doc.getText());
  }
  const openListener = vscode.workspace.onDidOpenTextDocument(doc => {
    docTextCache.set(doc.uri.toString(), doc.getText());
  });
  const closeListener = vscode.workspace.onDidCloseTextDocument(doc => {
    docTextCache.delete(doc.uri.toString());
  });

  const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
    if (!trackingEnabled) return;
    if (event.document.uri.scheme !== 'file') return; // skip output/debug/git virtual docs
    if (event.contentChanges.length === 0) return;

    handleDocumentChange(event);
  });

  registerFileEventTracking(context, () => trackingEnabled);
  registerIntegrityProtection(context);

  const toggleCmd = vscode.commands.registerCommand('audit.toggle', () => {
    trackingEnabled = !trackingEnabled;
    vscode.window.showInformationMessage(`Audit: tracking ${trackingEnabled ? 'enabled' : 'disabled'}.`);
  });

  const openLogCmd = vscode.commands.registerCommand('audit.openLog', async () => {
    const logPath = getTodayLogPath(activeWorkspaceRoot());
    if (!logPath) {
      vscode.window.showWarningMessage('Audit: open a workspace folder first.');
      return;
    }
    const uri = vscode.Uri.file(logPath);

    // Close any existing tab(s) for this file FIRST, so VS Code has no
    // cached in-memory document left to reuse. Relying on "revert" alone
    // only refreshes whichever tab happens to be the active editor at
    // that instant — if focus isn't exactly where expected, it silently
    // reverts nothing, with no error, leaving stale content on screen.
    // Actually closing and reopening guarantees a genuine fresh disk read
    // every single time, regardless of focus state.
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString()) {
          await vscode.window.tabGroups.close(tab);
        }
      }
    }

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch {
      vscode.window.showInformationMessage('Audit: no entries logged yet today.');
    }
  });

  const openFolderCmd = vscode.commands.registerCommand('audit.openLogFolder', async () => {
    const folder = getLogFolderPath(activeWorkspaceRoot());
    if (!folder) {
      vscode.window.showWarningMessage('Audit: open a workspace folder first.');
      return;
    }
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(folder));
  });

  const setNameCmd = vscode.commands.registerCommand('audit.setDeveloperName', async () => {
    const name = await vscode.window.showInputBox({
      prompt: 'Name to attribute your manual edits to in the Audit log',
      placeHolder: 'e.g. Vaibhav',
    });
    if (name) {
      await vscode.workspace.getConfiguration('audit').update('developerName', name, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Audit: developer name set to "${name}".`);
    }
  });

  const correctCmd = vscode.commands.registerCommand('audit.correctLastEntry', async () => {
    const developerName = vscode.workspace.getConfiguration('audit').get<string>('developerName', '');
    await correctLastEntry(lastEntry, developerName);
  });

  const commitSummaryCmd = vscode.commands.registerCommand('audit.addSummaryToCommit', async () => {
    await insertSummaryIntoCommitMessage(getTodayLogPath(activeWorkspaceRoot()));
  });

  const addReasonCmd = vscode.commands.registerCommand('audit.addReasonToLastEntry', async () => {
    await addReasonToLastEntry(lastEntry);
  });

  const dashboardCmd = vscode.commands.registerCommand('audit.openDashboard', () => {
    openDashboard(activeWorkspaceRoot());
  });

  const exportCsvCmd = vscode.commands.registerCommand('audit.exportCsv', async () => {
    await exportLogToCsv(activeWorkspaceRoot());
  });

  context.subscriptions.push(
    changeListener,
    openListener,
    closeListener,
    activeEditorListener,
    toggleCmd,
    openLogCmd,
    openFolderCmd,
    setNameCmd,
    correctCmd,
    commitSummaryCmd,
    addReasonCmd,
    dashboardCmd,
    exportCsvCmd
  );
}

async function ensureDeveloperNameSet(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('audit');
  const existing = config.get<string>('developerName', '');
  if (existing) return;

  const name = await vscode.window.showInputBox({
    prompt: 'Audit: what name should manual edits be attributed to?',
    placeHolder: 'e.g. Vaibhav',
  });
  if (name) {
    await config.update('developerName', name, vscode.ConfigurationTarget.Global);
  }
}

/**
 * Best-effort root folder for commands invoked with no specific file
 * context (Command Palette). Prefers the active editor's own workspace
 * root — important in multi-root workspaces so "Open Dashboard" etc.
 * show the right project's log, not always the first root folder.
 */
function activeWorkspaceRoot(): string | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const wsFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
    if (wsFolder) return wsFolder.uri.fsPath;
  }
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}

function handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
  const now = Date.now();
  const msSinceLastKeystroke = now - lastKeystrokeTime;
  lastKeystrokeTime = now;

  const config = vscode.workspace.getConfiguration('audit');
  const minLines = config.get<number>('minLinesForAIHeuristic', 2);
  const developerName = config.get<string>('developerName', '');

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(event.document.uri);
  const relativePath = workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, event.document.uri.fsPath)
    : event.document.uri.fsPath;

  // CRITICAL: never track edits to our own log folder. Writing an entry
  // touches a file on disk, which (if that file happens to be open in an
  // editor) fires this same event again — an infinite feedback loop that
  // explodes the log file and hangs the editor. This guard is what stops
  // that from ever happening, regardless of the configured folder name.
  const logFolderName = config.get<string>('logFolder', '.audit');
  const normalizedRelative = relativePath.split(path.sep).join('/');
  if (
    normalizedRelative === logFolderName ||
    normalizedRelative.startsWith(logFolderName + '/') ||
    normalizedRelative.includes('/' + logFolderName + '/')
  ) {
    return;
  }

  const ignoreBlank = config.get<boolean>('ignoreBlankLineChanges', true);
  const ignoreCommentOnly = config.get<boolean>('ignoreCommentOnlyChanges', true);

  const uriKey = event.document.uri.toString();
  const previousText = docTextCache.get(uriKey);

  for (const change of event.contentChanges) {
    const insertedText = change.text;
    const insertedLineCount = insertedText.split('\n').length - 1;
    const removedLineCount = change.range.end.line - change.range.start.line;

    // Skip trivial no-op-ish changes (e.g. single space, autoformat re-indent of one line)
    if (insertedText.length === 0 && removedLineCount === 0) continue;

    // Look up what was actually removed, using the pre-change snapshot.
    // rangeOffset/rangeLength are defined against the OLD document, which
    // is exactly what our cached previousText represents.
    const removedText =
      previousText !== undefined ? previousText.substr(change.rangeOffset, change.rangeLength) : '';

    const judgement = judgeContent(removedText, insertedText);
    if (ignoreBlank && judgement.isBlankOnly) continue;
    if (ignoreCommentOnly && judgement.isCommentOnly) continue;

    const shape: EditShape = {
      insertedLineCount,
      insertedCharCount: insertedText.length,
      isSingleContiguousInsert: !insertedText.includes('\n') || insertedLineCount >= 1,
      replacedExistingText: !change.range.isEmpty,
      msSinceLastKeystroke,
    };

    // Only log edits that look "meaningful" — at least minLines OR a deletion of existing code.
    // Pure single-character typing is tracked for timing purposes but not spammed to the log;
    // it gets batched conceptually into the next meaningful save-worthy edit in a future version.
    if (insertedLineCount < minLines && removedLineCount === 0 && insertedText.length < 20) {
      continue;
    }

    const activeTools = getActiveAITools();
    const preferredTool = config.get<string>('preferredAITool', '').trim();
    let source = classifyEdit(shape, activeTools);
    // If the user told us they only use one AI tool in this workspace,
    // trust that over an ambiguous multi-candidate guess.
    if (source.mode === 'ai-likely' && preferredTool) {
      source = { mode: 'ai-likely', tool: preferredTool };
    }

    const excludeTestDesignChange = config.get<boolean>('excludeDesignChangeForTestFiles', true);
    const isTestFile = /\.(spec|test)\.[jt]sx?$/.test(relativePath);
    const designCheck =
      isTestFile && excludeTestDesignChange ? { isDesignChange: false } : detectDesignChange(insertedText);

    // Same-line edits (e.g. replacing text within one line) compute to 0 via
    // line-count math even though real content changed — floor both sides at
    // 1 whenever there's actually something inserted/removed, so the log
    // never shows a misleading "+0 / -0".
    const effectiveAddedLines = insertedText.length > 0 ? Math.max(insertedLineCount, 1) : 0;
    const effectiveRemovedLines =
      removedLineCount > 0 ? removedLineCount : change.range.isEmpty ? 0 : 1;

    // Nothing actually changed on either side — skip, don't log noise.
    if (effectiveAddedLines === 0 && effectiveRemovedLines === 0) continue;

    const startLine = change.range.start.line + 1; // 1-indexed for humans
    const endLine = startLine + Math.max(insertedLineCount, removedLineCount);

    const tagBranch = config.get<boolean>('tagGitBranch', true);
    const branch = tagBranch ? getCurrentGitBranch() : undefined;

    const appendResult = appendLogEntry({
      filePath: relativePath,
      startLine,
      endLine,
      source,
      developerName,
      addedLines: effectiveAddedLines,
      removedLines: effectiveRemovedLines,
      designChange: designCheck.isDesignChange,
      designChangeReason: designCheck.reason,
      branch,
      workspaceRootFsPath: workspaceFolder?.uri.fsPath,
    });

    if (appendResult) {
      lastEntry = { logFilePath: appendResult.logFilePath, timestamp: appendResult.timestamp, filePath: relativePath };
      refreshStatusBar(appendResult.logFilePath, relativePath.split(path.sep).join('/'));

      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === event.document.uri.toString()
      );
      if (editor) {
        flashEditDecoration(editor, startLine, endLine, source, developerName);
      }
    }
  }

  // Snapshot current (post-change) text as the baseline for the NEXT event.
  docTextCache.set(uriKey, event.document.getText());
}

export function deactivate() {}
