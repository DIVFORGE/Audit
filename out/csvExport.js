"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportLogToCsv = exportLogToCsv;
const vscode = require("vscode");
const fs = require("fs");
const logParser_1 = require("./logParser");
const logger_1 = require("./logger");
function csvEscape(value) {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
}
async function exportLogToCsv(workspaceRootFsPath) {
    const folder = (0, logger_1.getLogFolderPath)(workspaceRootFsPath);
    if (!folder) {
        vscode.window.showWarningMessage('Audit: open a workspace folder first.');
        return;
    }
    const entries = (0, logParser_1.parseAllLogs)(folder);
    if (entries.length === 0) {
        vscode.window.showInformationMessage('Audit: no entries to export yet.');
        return;
    }
    const header = ['Date', 'Time', 'Project', 'Language', 'File', 'Category', 'Tool/Developer', 'Branch', 'Change', 'DesignChange', 'Reason'];
    const rows = entries.map(e => [
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
        .join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('ai-track-export.csv'),
        filters: { 'CSV files': ['csv'] },
    });
    if (!uri)
        return;
    fs.writeFileSync(uri.fsPath, csv, 'utf8');
    vscode.window.showInformationMessage(`Audit: exported ${entries.length} entries to ${uri.fsPath}`);
}
//# sourceMappingURL=csvExport.js.map