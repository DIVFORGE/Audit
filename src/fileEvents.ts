import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getActiveAITools } from './attribution';
import { appendFileEventEntry } from './logger';
import { getCurrentGitBranch } from './branch';

function relativeAndRoot(uri: vscode.Uri): { relativePath: string; rootFsPath?: string } {
  const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!wsFolder) return { relativePath: uri.fsPath, rootFsPath: undefined };
  return {
    relativePath: path.relative(wsFolder.uri.fsPath, uri.fsPath).split(path.sep).join('/'),
    rootFsPath: wsFolder.uri.fsPath,
  };
}

function isInsideLogFolder(relativePath: string, logFolderName: string): boolean {
  return (
    relativePath === logFolderName ||
    relativePath.startsWith(logFolderName + '/') ||
    relativePath.includes('/' + logFolderName + '/')
  );
}

/**
 * Best-effort guess for who created a file: if exactly one AI extension
 * is active AND the file already has substantial content the instant it
 * appears (characteristic of an AI agent writing a whole file in one
 * shot), attribute to that tool. Otherwise assume a human created it
 * (the overwhelmingly common case for "New File" / manual scaffolding).
 * This is a coarser guess than the in-document edit heuristic, since
 * file-creation events carry no keystroke-timing signal at all.
 */
function guessFileCreator(sizeBytes: number, developerName: string): string {
  const activeTools = getActiveAITools();
  const looksAIWritten = sizeBytes > 200; // a human-created new file is normally empty or near-empty
  if (looksAIWritten && activeTools.length === 1) {
    return `AI — ${activeTools[0].label} (guessed)`;
  }
  if (looksAIWritten && activeTools.length > 1) {
    return `AI — possibly: ${activeTools.map(t => t.label).join(' / ')} (guessed)`;
  }
  return `Developer — ${developerName || 'unknown'}`;
}

export function registerFileEventTracking(context: vscode.ExtensionContext, isTrackingEnabled: () => boolean) {
  const createListener = vscode.workspace.onDidCreateFiles(async event => {
    if (!isTrackingEnabled()) return;
    const config = vscode.workspace.getConfiguration('audit');
    const logFolderName = config.get<string>('logFolder', '.audit');
    const developerName = config.get<string>('developerName', '');
    const tagBranch = config.get<boolean>('tagGitBranch', true);

    for (const uri of event.files) {
      const { relativePath, rootFsPath } = relativeAndRoot(uri);
      if (isInsideLogFolder(relativePath, logFolderName)) continue;

      let sizeBytes = 0;
      try {
        sizeBytes = fs.statSync(uri.fsPath).size;
      } catch {
        /* file may already be gone or a directory — best effort only */
      }

      appendFileEventEntry({
        filePath: relativePath,
        eventLabel: 'File Created',
        modeLabel: guessFileCreator(sizeBytes, developerName),
        branch: tagBranch ? getCurrentGitBranch() : undefined,
        workspaceRootFsPath: rootFsPath,
      });
    }
  });

  const deleteListener = vscode.workspace.onDidDeleteFiles(event => {
    if (!isTrackingEnabled()) return;
    const config = vscode.workspace.getConfiguration('audit');
    const logFolderName = config.get<string>('logFolder', '.audit');
    const developerName = config.get<string>('developerName', '');
    const tagBranch = config.get<boolean>('tagGitBranch', true);

    for (const uri of event.files) {
      const { relativePath, rootFsPath } = relativeAndRoot(uri);
      if (isInsideLogFolder(relativePath, logFolderName)) continue;

      appendFileEventEntry({
        filePath: relativePath,
        eventLabel: 'File Deleted',
        // Deletions carry no content/timing signal to guess AI vs manual from,
        // and are overwhelmingly manual (Explorer delete) — attribute to the
        // developer rather than guessing a tool with no evidence.
        modeLabel: `Developer — ${developerName || 'unknown'}`,
        branch: tagBranch ? getCurrentGitBranch() : undefined,
        workspaceRootFsPath: rootFsPath,
      });
    }
  });

  const renameListener = vscode.workspace.onDidRenameFiles(event => {
    if (!isTrackingEnabled()) return;
    const config = vscode.workspace.getConfiguration('audit');
    const logFolderName = config.get<string>('logFolder', '.audit');
    const developerName = config.get<string>('developerName', '');
    const tagBranch = config.get<boolean>('tagGitBranch', true);

    for (const { oldUri, newUri } of event.files) {
      const { relativePath: newRel, rootFsPath } = relativeAndRoot(newUri);
      const { relativePath: oldRel } = relativeAndRoot(oldUri);
      if (isInsideLogFolder(newRel, logFolderName) || isInsideLogFolder(oldRel, logFolderName)) continue;

      appendFileEventEntry({
        filePath: `${newRel} (renamed from ${oldRel})`,
        eventLabel: 'File Renamed',
        modeLabel: `Developer — ${developerName || 'unknown'}`,
        branch: tagBranch ? getCurrentGitBranch() : undefined,
        workspaceRootFsPath: rootFsPath,
      });
    }
  });

  context.subscriptions.push(createListener, deleteListener, renameListener);
}
