"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flashEditDecoration = flashEditDecoration;
const vscode = require("vscode");
const aiDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(64, 140, 255, 0.18)',
    overviewRulerColor: 'rgba(64, 140, 255, 0.8)',
    overviewRulerLane: vscode.OverviewRulerLane.Left,
    isWholeLine: true,
});
const developerDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(80, 200, 120, 0.15)',
    overviewRulerColor: 'rgba(80, 200, 120, 0.8)',
    overviewRulerLane: vscode.OverviewRulerLane.Left,
    isWholeLine: true,
});
const externalDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 165, 0, 0.15)',
    overviewRulerColor: 'rgba(255, 165, 0, 0.8)',
    overviewRulerLane: vscode.OverviewRulerLane.Left,
    isWholeLine: true,
});
const FLASH_DURATION_MS = 4000;
function decorationFor(source) {
    switch (source.mode) {
        case 'ai-likely':
            return aiDecoration;
        case 'manual':
            return developerDecoration;
        case 'external-paste':
            return externalDecoration;
        default:
            return undefined; // don't decorate unclassified — no signal worth flashing
    }
}
function hoverTextFor(source, developerName) {
    switch (source.mode) {
        case 'ai-likely':
            return `Audit: written by ${source.tool}`;
        case 'manual':
            return `Audit: written by ${developerName || 'you'}`;
        case 'external-paste':
            return `Audit: pasted from an external/unknown source`;
        default:
            return 'Audit';
    }
}
/**
 * Briefly highlights the edited lines in the given editor, colored by
 * source, then clears itself after FLASH_DURATION_MS. This is a live
 * "who just wrote this" cue while coding — not a persistent blame view,
 * since tracking exact ranges across further edits reliably would need
 * much heavier bookkeeping than a lightweight extension should carry.
 */
function flashEditDecoration(editor, startLine1Indexed, endLine1Indexed, source, developerName) {
    const decorationType = decorationFor(source);
    if (!decorationType)
        return;
    const doc = editor.document;
    const startLine = Math.max(0, startLine1Indexed - 1);
    const endLine = Math.min(doc.lineCount - 1, Math.max(startLine, endLine1Indexed - 1));
    const range = new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine, doc.lineAt(endLine).text.length));
    const options = {
        range,
        hoverMessage: hoverTextFor(source, developerName),
    };
    editor.setDecorations(decorationType, [options]);
    setTimeout(() => {
        // Guard: editor may have closed by the time this fires.
        try {
            editor.setDecorations(decorationType, []);
        }
        catch {
            /* editor no longer valid — nothing to clean up */
        }
    }, FLASH_DURATION_MS);
}
//# sourceMappingURL=decorations.js.map