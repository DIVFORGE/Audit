"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addReasonToLastEntry = addReasonToLastEntry;
const vscode = require("vscode");
const fs = require("fs");
async function addReasonToLastEntry(lastEntry) {
    if (!lastEntry) {
        vscode.window.showInformationMessage('Audit: no recent entry to annotate yet.');
        return;
    }
    const reason = await vscode.window.showInputBox({
        prompt: `What was this change for? (${lastEntry.filePath})`,
        placeHolder: 'e.g. Fix token expiry bug in roomer verification',
    });
    if (!reason)
        return;
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
        let block = content.slice(blockStart, blockEnd);
        if (/^- Reason:/m.test(block)) {
            block = block.replace(/^- Reason:.*$/m, `- Reason: ${reason}`);
        }
        else {
            block = block.replace(/\n+$/, '') + `\n- Reason: ${reason}\n\n`;
        }
        const updatedContent = content.slice(0, blockStart) + block + content.slice(blockEnd);
        fs.writeFileSync(lastEntry.logFilePath, updatedContent, 'utf8');
        vscode.window.showInformationMessage('Audit: reason added to last entry.');
    }
    catch (err) {
        vscode.window.showErrorMessage(`Audit: failed to add reason — ${err}`);
    }
}
//# sourceMappingURL=reason.js.map