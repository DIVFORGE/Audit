import * as vscode from 'vscode';
import * as fs from 'fs';

export interface LastEntryRef {
  logFilePath: string;
  timestamp: string; // "HH:MM:SS" — used to uniquely locate the entry block
  filePath: string;
}

const CORRECTION_OPTIONS = [
  'Developer (manual)',
  'GitHub Copilot',
  'GitHub Copilot Chat',
  'Claude Code',
  'Cursor',
  'Continue',
  'Codeium',
  'Tabnine',
  'External paste (unknown source)',
];

export async function correctLastEntry(lastEntry: LastEntryRef | undefined, developerName: string) {
  if (!lastEntry) {
    vscode.window.showInformationMessage('Audit: no recent entry to correct yet.');
    return;
  }

  const choice = await vscode.window.showQuickPick(CORRECTION_OPTIONS, {
    placeHolder: `Correct attribution for the last entry in ${lastEntry.filePath}`,
  });
  if (!choice) return;

  let newModeLine: string;
  if (choice === 'Developer (manual)') {
    newModeLine = `- Mode: Developer — ${developerName || 'unknown'} (corrected)`;
  } else if (choice === 'External paste (unknown source)') {
    newModeLine = `- Mode: External paste (source tool not detectable) (corrected)`;
  } else {
    newModeLine = `- Mode: AI — ${choice} (corrected)`;
  }

  try {
    const content = fs.readFileSync(lastEntry.logFilePath, 'utf8');
    const blockHeader = `## ${lastEntry.timestamp}`;
    const blockStart = content.lastIndexOf(blockHeader);
    if (blockStart === -1) {
      vscode.window.showWarningMessage('Audit: could not locate that entry in the log — it may have scrolled out.');
      return;
    }

    const nextBlockStart = content.indexOf('\n## ', blockStart + 1);
    const blockEnd = nextBlockStart === -1 ? content.length : nextBlockStart;
    const block = content.slice(blockStart, blockEnd);

    const updatedBlock = block.replace(/^- Mode:.*$/m, newModeLine);
    if (updatedBlock === block) {
      vscode.window.showWarningMessage('Audit: could not find a Mode line to correct in that entry.');
      return;
    }

    const updatedContent = content.slice(0, blockStart) + updatedBlock + content.slice(blockEnd);
    fs.writeFileSync(lastEntry.logFilePath, updatedContent, 'utf8');
    vscode.window.showInformationMessage(`Audit: attribution corrected to "${choice}".`);
  } catch (err) {
    vscode.window.showErrorMessage(`Audit: failed to correct entry — ${err}`);
  }
}
