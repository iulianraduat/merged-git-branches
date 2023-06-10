'use strict';

import * as vscode from 'vscode';
import { mergedGitBranchesProvider } from './mergedGitBranches';
import { TreeNode } from './treeNode';

// find-unused-exports:ignore-next-line-exports
export const activate = (context: vscode.ExtensionContext) => {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showInformationMessage('We cannot check an empty workspace!');
    return;
  }

  const branchesProvider = new mergedGitBranchesProvider(
    workspaceFolders.map((ws) => ws.uri.fsPath)
  );
  vscode.window.registerTreeDataProvider('mergedGitBranches', branchesProvider);

  let disposable: vscode.Disposable;

  disposable = vscode.commands.registerCommand('mergedGitBranches.prune', () =>
    branchesProvider.prune()
  );
  context.subscriptions.push(disposable);

  disposable = vscode.commands.registerCommand(
    'mergedGitBranches.refresh',
    () => branchesProvider.refresh()
  );
  context.subscriptions.push(disposable);

  disposable = vscode.commands.registerCommand(
    'mergedGitBranches.copyName',
    (branch: TreeNode) => branchesProvider.copyName(branch)
  );
  context.subscriptions.push(disposable);

  disposable = vscode.commands.registerCommand(
    'mergedGitBranches.delete',
    (branch: TreeNode) => branchesProvider.delete(branch)
  );
  context.subscriptions.push(disposable);
};

export function deactivate() {}
