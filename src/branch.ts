import * as vscode from 'vscode';

/**
 * Returns the current git branch name, or undefined if no git repo is
 * open, the git extension hasn't activated yet, or HEAD is detached.
 * Best-effort only — never throws, since this is a nice-to-have tag,
 * not something that should ever block logging.
 */
export function getCurrentGitBranch(): string | undefined {
  try {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension || !gitExtension.isActive) return undefined;
    const gitApi = gitExtension.exports.getAPI(1);
    if (!gitApi.repositories || gitApi.repositories.length === 0) return undefined;
    return gitApi.repositories[0].state?.HEAD?.name;
  } catch {
    return undefined;
  }
}
