"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openDashboard = openDashboard;
const vscode = require("vscode");
const logParser_1 = require("./logParser");
const logger_1 = require("./logger");
function openDashboard(workspaceRootFsPath) {
    const folder = (0, logger_1.getLogFolderPath)(workspaceRootFsPath);
    if (!folder) {
        vscode.window.showWarningMessage('Audit: open a workspace folder first.');
        return;
    }
    const entries = (0, logParser_1.parseAllLogs)(folder);
    const panel = vscode.window.createWebviewPanel('auditDashboard', 'Audit Dashboard', vscode.ViewColumn.Active, { enableScripts: true });
    panel.webview.html = renderDashboardHtml(entries);
}
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function renderDashboardHtml(entries) {
    const totalAI = entries.filter(e => e.category === 'ai').length;
    const totalDev = entries.filter(e => e.category === 'developer').length;
    const totalExternal = entries.filter(e => e.category === 'external').length;
    const designChangeCount = entries.filter(e => e.designChange).length;
    const areas = Array.from(new Set(entries.map(e => e.area))).sort();
    const areaOptions = areas.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
    const languages = Array.from(new Set(entries.map(e => e.language))).sort();
    const languageOptions = languages.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
    const areaBreakdown = areas
        .map(a => {
        const count = entries.filter(e => e.area === a).length;
        const aiCount = entries.filter(e => e.area === a && e.category === 'ai').length;
        return `<div class="stat">${escapeHtml(a)}<br><b>${count}</b> <span class="substat">(${aiCount} AI)</span></div>`;
    })
        .join('');
    const rows = entries
        .slice()
        .reverse() // most recent first
        .map(e => `
      <tr data-category="${e.category}" data-area="${escapeHtml(e.area.toLowerCase())}" data-language="${escapeHtml(e.language.toLowerCase())}" data-file="${escapeHtml(e.file.toLowerCase())}" data-who="${escapeHtml(e.toolOrDeveloper.toLowerCase())}">
        <td>${e.date} ${e.time}</td>
        <td><span class="area-badge">${escapeHtml(e.area)}</span></td>
        <td><span class="lang-badge">${escapeHtml(e.language)}</span></td>
        <td class="mono">${escapeHtml(e.file)}</td>
        <td>${escapeHtml(e.modeRaw)}</td>
        <td>${escapeHtml(e.change)}</td>
        <td>${e.branch ? escapeHtml(e.branch) : '—'}</td>
        <td>${e.designChange ? '⚠️' : ''}</td>
        <td>${e.reason ? escapeHtml(e.reason) : ''}</td>
      </tr>`)
        .join('');
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 16px;
  }
  h2 { margin-top: 0; }
  h3 { font-size: 13px; opacity: 0.8; margin: 16px 0 6px; }
  .stats { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .stat {
    padding: 8px 14px;
    border: 1px solid var(--vscode-panel-border, #444);
    border-radius: 6px;
    font-size: 13px;
  }
  .stat b { font-size: 16px; }
  .substat { opacity: 0.7; font-size: 11px; }
  .filters { margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
  select, input {
    padding: 5px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 4px;
  }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td {
    border: 1px solid var(--vscode-panel-border, #444);
    padding: 5px 9px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: var(--vscode-editorWidget-background, #2a2a2a);
    position: sticky;
    top: 0;
  }
  .mono { font-family: var(--vscode-editor-font-family, monospace); }
  .area-badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 10px;
    background: var(--vscode-badge-background, #444);
    color: var(--vscode-badge-foreground, #fff);
    font-size: 11px;
  }
  .lang-badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 10px;
    background: var(--vscode-terminal-ansiBlue, #3b6ea5);
    color: #fff;
    font-size: 11px;
  }
  tr[style*="display: none"] { display: none; }
</style>
</head>
<body>
  <h2>Audit Dashboard</h2>
  <div class="stats">
    <div class="stat">AI edits<br><b>${totalAI}</b></div>
    <div class="stat">Manual edits<br><b>${totalDev}</b></div>
    <div class="stat">External paste<br><b>${totalExternal}</b></div>
    <div class="stat">Design changes<br><b>${designChangeCount}</b></div>
    <div class="stat">Total entries<br><b>${entries.length}</b></div>
  </div>
  ${areas.length > 1 ? `<h3>By project</h3><div class="stats">${areaBreakdown}</div>` : ''}
  <div class="filters">
    <select id="categoryFilter">
      <option value="">All categories</option>
      <option value="ai">AI</option>
      <option value="developer">Developer</option>
      <option value="external">External paste</option>
      <option value="unclassified">Unclassified</option>
    </select>
    <select id="areaFilter">
      <option value="">All projects</option>
      ${areaOptions}
    </select>
    <select id="languageFilter">
      <option value="">All languages</option>
      ${languageOptions}
    </select>
    <input id="fileFilter" placeholder="Filter by file path..." />
    <input id="whoFilter" placeholder="Filter by developer or tool..." />
  </div>
  <table id="logTable">
    <thead>
      <tr><th>When</th><th>Project</th><th>Language</th><th>File</th><th>Mode</th><th>Change</th><th>Branch</th><th>Design</th><th>Reason</th></tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="9">No entries logged yet.</td></tr>'}</tbody>
  </table>
  <script>
    const categoryFilter = document.getElementById('categoryFilter');
    const areaFilter = document.getElementById('areaFilter');
    const languageFilter = document.getElementById('languageFilter');
    const fileFilter = document.getElementById('fileFilter');
    const whoFilter = document.getElementById('whoFilter');
    function applyFilters() {
      const cat = categoryFilter.value;
      const area = areaFilter.value.toLowerCase();
      const language = languageFilter.value.toLowerCase();
      const fileTerm = fileFilter.value.toLowerCase();
      const whoTerm = whoFilter.value.toLowerCase();
      document.querySelectorAll('#logTable tbody tr').forEach(row => {
        if (!row.dataset.category) return; // skip the "no entries" placeholder row
        const matchesCat = !cat || row.dataset.category === cat;
        const matchesArea = !area || row.dataset.area === area;
        const matchesLanguage = !language || row.dataset.language === language;
        const matchesFile = !fileTerm || row.dataset.file.includes(fileTerm);
        const matchesWho = !whoTerm || row.dataset.who.includes(whoTerm);
        row.style.display = (matchesCat && matchesArea && matchesLanguage && matchesFile && matchesWho) ? '' : 'none';
      });
    }
    categoryFilter.addEventListener('change', applyFilters);
    areaFilter.addEventListener('change', applyFilters);
    languageFilter.addEventListener('change', applyFilters);
    fileFilter.addEventListener('input', applyFilters);
    whoFilter.addEventListener('input', applyFilters);
  </script>
</body>
</html>`;
}
//# sourceMappingURL=dashboard.js.map