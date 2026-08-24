"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFileEventTracking = registerFileEventTracking;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const attribution_1 = require("./attribution");
const logger_1 = require("./logger");
const branch_1 = require("./branch");
function relativeAndRoot(uri) {
    const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!wsFolder)
        return { relativePath: uri.fsPath, rootFsPath: undefined };
    return {
        relativePath: path.relative(wsFolder.uri.fsPath, uri.fsPath).split(path.sep).join('/'),
        rootFsPath: wsFolder.uri.fsPath,
    };
}
function isInsideLogFolder(relativePath, logFolderName) {
    return (relativePath === logFolderName ||
        relativePath.startsWith(logFolderName + '/') ||
        relativePath.includes('/' + logFolderName + '/'));
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
function guessFileCreator(sizeBytes, developerName) {
    const activeTools = (0, attribution_1.getActiveAITools)();
    const looksAIWritten = sizeBytes > 200; // a human-created new file is normally empty or near-empty
    if (looksAIWritten && activeTools.length === 1) {
        return `AI — ${activeTools[0].label} (guessed)`;
    }
    if (looksAIWritten && activeTools.length > 1) {
        return `AI — possibly: ${activeTools.map(t => t.label).join(' / ')} (guessed)`;
    }
    return `Developer — ${developerName || 'unknown'}`;
}
function registerFileEventTracking(context, isTrackingEnabled) {
    const createListener = vscode.workspace.onDidCreateFiles(async (event) => {
        if (!isTrackingEnabled())
            return;
        const config = vscode.workspace.getConfiguration('audit');
        const logFolderName = config.get('logFolder', '.audit');
        const developerName = config.get('developerName', '');
        const tagBranch = config.get('tagGitBranch', true);
        for (const uri of event.files) {
            const { relativePath, rootFsPath } = relativeAndRoot(uri);
            if (isInsideLogFolder(relativePath, logFolderName))
                continue;
            let sizeBytes = 0;
            try {
                sizeBytes = fs.statSync(uri.fsPath).size;
            }
            catch {
                /* file may already be gone or a directory — best effort only */
            }
            (0, logger_1.appendFileEventEntry)({
                filePath: relativePath,
                eventLabel: 'File Created',
                modeLabel: guessFileCreator(sizeBytes, developerName),
                branch: tagBranch ? (0, branch_1.getCurrentGitBranch)() : undefined,
                workspaceRootFsPath: rootFsPath,
            });
        }
    });
    const deleteListener = vscode.workspace.onDidDeleteFiles(event => {
        if (!isTrackingEnabled())
            return;
        const config = vscode.workspace.getConfiguration('audit');
        const logFolderName = config.get('logFolder', '.audit');
        const developerName = config.get('developerName', '');
        const tagBranch = config.get('tagGitBranch', true);
        for (const uri of event.files) {
            const { relativePath, rootFsPath } = relativeAndRoot(uri);
            if (isInsideLogFolder(relativePath, logFolderName))
                continue;
            (0, logger_1.appendFileEventEntry)({
                filePath: relativePath,
                eventLabel: 'File Deleted',
                // Deletions carry no content/timing signal to guess AI vs manual from,
                // and are overwhelmingly manual (Explorer delete) — attribute to the
                // developer rather than guessing a tool with no evidence.
                modeLabel: `Developer — ${developerName || 'unknown'}`,
                branch: tagBranch ? (0, branch_1.getCurrentGitBranch)() : undefined,
                workspaceRootFsPath: rootFsPath,
            });
        }
    });
    const renameListener = vscode.workspace.onDidRenameFiles(event => {
        if (!isTrackingEnabled())
            return;
        const config = vscode.workspace.getConfiguration('audit');
        const logFolderName = config.get('logFolder', '.audit');
        const developerName = config.get('developerName', '');
        const tagBranch = config.get('tagGitBranch', true);
        for (const { oldUri, newUri } of event.files) {
            const { relativePath: newRel, rootFsPath } = relativeAndRoot(newUri);
            const { relativePath: oldRel } = relativeAndRoot(oldUri);
            if (isInsideLogFolder(newRel, logFolderName) || isInsideLogFolder(oldRel, logFolderName))
                continue;
            (0, logger_1.appendFileEventEntry)({
                filePath: `${newRel} (renamed from ${oldRel})`,
                eventLabel: 'File Renamed',
                modeLabel: `Developer — ${developerName || 'unknown'}`,
                branch: tagBranch ? (0, branch_1.getCurrentGitBranch)() : undefined,
                workspaceRootFsPath: rootFsPath,
            });
        }
    });
    context.subscriptions.push(createListener, deleteListener, renameListener);
}
//# sourceMappingURL=fileEvents.js.map