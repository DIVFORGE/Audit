import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Absolute file path -> the full content we last legitimately wrote.
// This is our source of truth for "what should be in this file."
const lastKnownGood = new Map<string, string>();

/**
 * Call this immediately after every successful write we make (append or
 * header creation), passing the FULL current file content. Keeps our
 * baseline in sync with our own legitimate writes so the integrity
 * check below never mistakes our own append for external tampering.
 */
export function noteWrite(logFilePath: string, fullContent: string) {
  lastKnownGood.set(logFilePath, fullContent);
}

function restorationNoticeBlock(reason: string): string {
  const timestamp = new Date().toTimeString().split(' ')[0];
  return [
    `## ${timestamp}`,
    `- Event: Log Integrity Restored`,
    `- Mode: System`,
    `- Note: ${reason} — restored from last known good state.`,
    '',
    '',
  ].join('\n');
}

function restore(fsPath: string, reason: string) {
  const cached = lastKnownGood.get(fsPath);
  if (cached === undefined) return; // no baseline yet — nothing we can restore

  try {
    const restoredContent = cached + restorationNoticeBlock(reason);
    fs.writeFileSync(fsPath, restoredContent, 'utf8');
    lastKnownGood.set(fsPath, restoredContent);
    vscode.window.showWarningMessage(
      `Audit: today's log was modified outside the extension (${reason}) — restored automatically.`
    );
  } catch {
    /* best effort — if we can't write, there's nothing more to do here */
  }
}

function checkIntegrity(fsPath: string) {
  const cached = lastKnownGood.get(fsPath);
  if (cached === undefined) return; // we never wrote this file — not ours to protect

  if (!fs.existsSync(fsPath)) {
    restore(fsPath, 'file was deleted');
    return;
  }

  let current: string;
  try {
    current = fs.readFileSync(fsPath, 'utf8');
  } catch {
    return;
  }

  // Our own writes only ever APPEND, so legitimate content always keeps
  // everything we previously wrote as a prefix. If it doesn't, something
  // else removed, truncated, or rewrote entries — restore immediately.
  if (!current.startsWith(cached)) {
    restore(fsPath, 'earlier entries were removed or altered');
  }
}

/**
 * Watches each workspace root's log folder for changes made by ANY
 * process — not just VS Code's own file operations. This is what catches
 * an AI agent using a raw file write or a terminal command, which
 * onDidDeleteFiles/onDidChangeTextDocument would miss entirely since
 * those only fire for edits made through VS Code's own APIs.
 */
export function registerIntegrityProtection(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('audit');
  if (!config.get<boolean>('protectLogFromExternalChanges', true)) return;

  const logFolderName = config.get<string>('logFolder', '.audit');

  function watchFolder(root: vscode.WorkspaceFolder) {
    const pattern = new vscode.RelativePattern(root, `${logFolderName}/*.md`);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidDelete(uri => checkIntegrity(uri.fsPath));
    watcher.onDidChange(uri => checkIntegrity(uri.fsPath));
    context.subscriptions.push(watcher);

    // Preload existing logs as the trusted baseline, so protection is
    // active immediately on activation, not only after the next write.
    const folderPath = path.join(root.uri.fsPath, logFolderName);
    if (fs.existsSync(folderPath)) {
      for (const f of fs.readdirSync(folderPath)) {
        if (!f.endsWith('.md')) continue;
        const fp = path.join(folderPath, f);
        try {
          lastKnownGood.set(fp, fs.readFileSync(fp, 'utf8'));
        } catch {
          /* ignore unreadable files */
        }
      }
    }
  }

  (vscode.workspace.workspaceFolders || []).forEach(watchFolder);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(event => {
      event.added.forEach(watchFolder);
    })
  );
}
