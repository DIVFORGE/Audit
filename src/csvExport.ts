import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseAllLogs } from './logParser';
import { getLogFolderPath } from './logger';

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export async function exportLogToCsv(workspaceRootFsPath?: string) {
  const folder = getLogFolderPath(workspaceRootFsPath);
  if (!folder) {
    vscode.window.showWarningMessage('Audit: open a workspace folder first.');
    return;
  }

  const entries = parseAllLogs(folder);
  if (entries.length === 0) {
    vscode.window.showInformationMessage('Audit: no entries to export yet.');
    return;
  }

  const header = ['Date', 'Time', 'Project', 'Language', 'File', 'Category', 'Tool/Developer', 'Branch', 'Change', 'DesignChange', 'Reason'];
  const rows = entries.map(e =>
    [
      e.date,
      e.time,
      e.area,
      e.language,
      e.file,
      e.category,
      e.toolOrDeveloper,
      e.branch || '',
      e.change,
      e.designChange ? 'true' : 'false',
      e.reason || '',
    ]
      .map(csvEscape)
      .join(',')
  );

  const csv = [header.join(','), ...rows].join('\n');

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file('ai-track-export.csv'),
    filters: { 'CSV files': ['csv'] },
  });
  if (!uri) return;

  fs.writeFileSync(uri.fsPath, csv, 'utf8');
  vscode.window.showInformationMessage(`Audit: exported ${entries.length} entries to ${uri.fsPath}`);
}
