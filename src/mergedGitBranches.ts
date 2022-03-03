import * as vscode from 'vscode';
import { log } from './merged-git-branches/log';
import {
  execute,
  getTreeItemCollapsibleState,
  removeWhitespaceBeforeBranch,
  sortByRemoteNameLengthDesc,
} from './merged-git-branches/utils';
import { Remote } from './treeNode';
import { DEPENDENCY_TYPE, TreeNode } from './treeNode';

export class mergedGitBranchesProvider
  implements vscode.TreeDataProvider<TreeNode>
{
  private cacheRepos: TreeNode[] | undefined;

  private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined> =
    new vscode.EventEmitter<TreeNode | undefined>();
  public readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined> =
    this._onDidChangeTreeData.event;

  constructor(private workspaceFolders: string[]) {
    this.refresh();
  }

  public async refresh() {
    if (!(await this.isGitCommandPresent()) || !this.workspaceFolders) {
      this.cacheRepos = [NoGitExecutable];
      return;
    }

    this.cacheRepos = [];
    for (const workspaceFolder of this.workspaceFolders) {
      await addRemotesForFolder(this.cacheRepos, workspaceFolder);
    }

    if (this.cacheRepos.length === 0) {
      this.cacheRepos = [NoBranchesFound];
    }

    this._onDidChangeTreeData.fire(undefined);
  }

  public delete(node: TreeNode): any {
    const terminal = vscode.window.createTerminal(
      `Delete remote branch ${node.parent?.label}/${node.label}`
    );
    terminal.show();
    const cmd = `git push ${node.parent?.label} -D ${node.label}`;
    terminal.sendText(cmd, false);
  }

  public prune() {
    if (this.cacheRepos === undefined) {
      return;
    }

    const remotes = this.cacheRepos;
    vscode.workspace.workspaceFolders?.forEach((ws) =>
      Promise.all(
        remotes.map((remote) =>
          execute(`git remote prune ${remote.label}`, ws.uri.fsPath)
        )
      )
    );
  }

  private async isGitCommandPresent(): Promise<boolean> {
    try {
      /* We check if git executable is accesible */
      const rows = await execute('git --version');
      return rows.length > 0;
    } catch (err) {
      return false;
    }
  }

  /* TreeDataProvider specific functions */

  public getParent(element: TreeNode) {
    return element.parent;
  }

  public getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: TreeNode): Thenable<TreeNode[]> {
    if (element) {
      return Promise.resolve(element.children);
    }

    return Promise.resolve(this.getRemotes());
  }

  private getRemotes(): TreeNode[] {
    return this.cacheRepos ?? [];
  }
}

async function addRemotesForFolder(cacheRepos: TreeNode[], folder: string) {
  try {
    /* get all remote names */
    const remoteNames = await execute('git remote', folder);
    const allRemotes: Remote[] = [];
    for (const name of remoteNames) {
      const url = (await execute(`git remote get-url ${name}`, folder))[0];
      allRemotes.push({ name, url });
    }

    /* we want only new repos */
    const remotes = allRemotes.filter(
      (remote) =>
        cacheRepos.some((knownRemote) => knownRemote.tooltip === remote.url) ===
        false
    );

    /* we add all new found remotes */
    remotes.forEach((remote) =>
      cacheRepos.push(
        new TreeNode(
          undefined,
          `${remote.name} ${remote.url}`,
          DEPENDENCY_TYPE.REMOTE,
          remote.name,
          remote.url
        )
      )
    );

    /* get all remote branches */
    const remoteBranches = (await execute('git branch -r', folder)).map(
      removeWhitespaceBeforeBranch
    );

    for (const branch of remoteBranches) {
      await addRemoteBranch(cacheRepos, folder, remotes, branch);
    }

    return cacheRepos;
  } catch (err: any) {
    log('Error:', err.message);
    return;
  }
}

const REMOTES = 'remotes/';
const REMOTES_LEN = REMOTES.length;
async function addRemoteBranch(
  cacheRemotes: TreeNode[],
  folder: string,
  remotes: Remote[],
  branch: string
) {
  /* find node for this branch */
  const remote = getRemoteForBranch(remotes, branch);
  if (remote === undefined) {
    /* this should never happen */
    return;
  }

  const node = getTreeNode(cacheRemotes, remote);
  if (node === undefined) {
    /* this should never happen */
    return;
  }
  node.collapsibleState = getTreeItemCollapsibleState();

  try {
    /* get the branch hash */
    const hash = (await execute(`git rev-parse ${branch}`, folder))[0];
    const date = (await execute(`git show -s --format=%ci ${hash}`, folder))[0];

    const branchNode = new TreeNode(
      node,
      `${node.id} ${branch} 2 ${Math.random()}`,
      DEPENDENCY_TYPE.BRANCH,
      branch.substring(remote.name.length + 1),
      date
    );
    node.children.push(branchNode);

    /* find in which branches is merged */
    const mergedInBranches = (
      await execute(`git branch -a --contains ${hash}`, folder)
    )
      .map(removeWhitespaceBeforeBranch)
      .filter((mergedInBranch) => mergedInBranch.startsWith(REMOTES))
      .map((mergedInBranch) => mergedInBranch.substring(REMOTES_LEN))
      .filter((mergedInBranch) => mergedInBranch !== branch);

    branchNode.children = mergedInBranches.map(
      (mergedInBranch) =>
        new TreeNode(
          branchNode,
          `${branchNode.id} ${mergedInBranch} 3 ${Math.random()}`,
          DEPENDENCY_TYPE.MERGED_IN_BRANCH,
          mergedInBranch.substring(node.label.length + 1)
        )
    );

    if (mergedInBranches.length > 0) {
      branchNode.collapsibleState = getTreeItemCollapsibleState();
      branchNode.update();
    }
  } catch (err: any) {
    log('Error:', err.message);
    return;
  }
}

function getRemoteForBranch(remotes: Remote[], branch: string) {
  return remotes
    .filter((remote) => branch.startsWith(`${remote.name}/`))
    .sort(sortByRemoteNameLengthDesc)[0];
}

function getTreeNode(cacheRemotes: TreeNode[], remote: Remote) {
  /* in tooltip we have the remote url */
  return cacheRemotes.find((node) => node.tooltip === remote.url);
}

const NoGitExecutable: TreeNode = new TreeNode(
  undefined,
  '-',
  DEPENDENCY_TYPE.GIT_EXECUTABLE_MISSING,
  'The command git was not found.'
);

const NoBranchesFound: TreeNode = new TreeNode(
  undefined,
  '-',
  DEPENDENCY_TYPE.EMPTY,
  'No branches were found'
);
