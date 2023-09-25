import * as childProcess from 'child_process';
import * as vscode from 'vscode';
import { Remote, TreeNode } from '../treeNode';

const reEOL = /\r?\n/g;
export function execute(command: string, cwd?: string): Promise<string[]> {
  return new Promise(function (resolve, reject) {
    childProcess.exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject();
        return;
      }

      if (stderr) {
        reject(stderr);
        return;
      }

      const rows = stdout.split(reEOL).filter(Boolean).filter(noLinkToBranch);
      resolve(rows);
    });
  });
}

function noLinkToBranch(branch: string) {
  return branch.includes('->') === false;
}

export function sortByRemoteNameLengthDesc(a: Remote, b: Remote) {
  const lenA = a.name.length;
  const lenB = b.name.length;
  return lenB - lenA;
}

export function removeWhitespaceBeforeBranch(branch: string) {
  return branch.substring(2);
}

export function getTreeItemCollapsibleState() {
  return isResultExpanded()
    ? vscode.TreeItemCollapsibleState.Expanded
    : vscode.TreeItemCollapsibleState.Collapsed;
}

function isResultExpanded(): boolean {
  return vscode.workspace
    .getConfiguration()
    .get('mergedGitBranches.defaultResultExpanded', false);
}
