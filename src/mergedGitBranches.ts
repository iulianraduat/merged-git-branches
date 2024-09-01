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
  private isSortedByDate: boolean = false;
  private cacheReposSortByName: TreeNode[] | undefined;
  private cacheReposSortByDate: TreeNode[] | undefined;

  private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined> =
    new vscode.EventEmitter<TreeNode | undefined>();
  public readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined> =
    this._onDidChangeTreeData.event;

  constructor(private workspaceFolders: string[]) {
    this.refresh();
  }

  public async refresh() {
    if (!(await this.isGitCommandPresent()) || !this.workspaceFolders) {
      this.cacheReposSortByName = [NoGitExecutable];
      this.cacheReposSortByDate = [NoGitExecutable];
      this._onDidChangeTreeData.fire(undefined);
      return;
    }

    this.cacheReposSortByName = [Refreshing];
    this.cacheReposSortByDate = [Refreshing];
    this._onDidChangeTreeData.fire(undefined);

    const cacheRepos: Array<TreeNode> = [];
    for (const workspaceFolder of this.workspaceFolders) {
      await addRemotesForFolder(cacheRepos, workspaceFolder);
    }

    this.cacheReposSortByName = [NoBranchesFound];
    this.cacheReposSortByDate = [NoBranchesFound];

    if (cacheRepos.length > 0) {
      this.cacheReposSortByName = cacheRepos.map((repo) =>
        this.sortRepo(repo, false)
      );
      this.cacheReposSortByDate = cacheRepos.map((repo) =>
        this.sortRepo(repo, true)
      );
    }

    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * by name ascending
   * by date descending
   */
  private sortRepo(node: TreeNode, sortByDate: boolean): TreeNode {
    const newNode = node.clone();
    newNode.children.sort((a, b) =>
      sortByDate
        ? this.getTooltip(b).localeCompare(this.getTooltip(a))
        : a.label.localeCompare(b.label)
    );
    return newNode;
  }

  private getTooltip(node: TreeNode): string {
    return node.tooltip?.toString() ?? '';
  }

  public prune() {
    if (
      vscode.workspace.workspaceFolders === undefined ||
      vscode.workspace.workspaceFolders.length === 0
    ) {
      return;
    }

    const remotes = this.getRemotes();
    if (remotes.length === 0) {
      return;
    }

    remotes.forEach((remote) => {
      const terminal = vscode.window.createTerminal(
        `git remote prune ${remote.label}`
      );
      terminal.show();
      const cmd = `git remote update --prune ${remote.label}`;
      terminal.sendText(cmd, false);
    });
  }

  public copyBranchName(node: TreeNode): void {
    const remote = getRemoteName(node.parent);
    const name = `${remote}/${node.label}`;
    vscode.env.clipboard
      .writeText(name)
      .then(() =>
        vscode.window.showInformationMessage(
          `Branch's name was copied in clipboard: ${name}`
        )
      );
  }

  public copyRepoAddress(node: TreeNode): void {
    const remoteUrl = getRemoteUrl(node);
    if (!remoteUrl) {
      return;
    }

    vscode.env.clipboard
      .writeText(remoteUrl)
      .then(() =>
        vscode.window.showInformationMessage(
          `Repo's address was copied in clipboard: ${remoteUrl}`
        )
      );
  }

  public delete(node: TreeNode): any {
    const terminal = vscode.window.createTerminal(
      `Delete remote branch ${node.parent?.label}/${node.label}`
    );
    terminal.show();
    const cmd = `git push ${node.parent?.label} --delete ${node.label}`;
    terminal.sendText(cmd, false);
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

  public sortByDate() {
    this.isSortedByDate = true;
    this._onDidChangeTreeData.fire(undefined);
  }

  public sortByName() {
    this.isSortedByDate = false;
    this._onDidChangeTreeData.fire(undefined);
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
    return (
      (this.isSortedByDate
        ? this.cacheReposSortByDate
        : this.cacheReposSortByName) ?? []
    );
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
    const dateAndEmailFields = (
      await execute(`git show -s --format="%ci %ce" ${hash}`, folder)
    )[0];
    const fields = dateAndEmailFields.split(' ');
    const dateAndEmail = `${fields[0]} ${fields[1]} ${fields[3]}`;

    const branchNode = new TreeNode(
      node,
      `${node.id} ${branch} 2 ${Math.random()}`,
      DEPENDENCY_TYPE.BRANCH,
      branch.substring(remote.name.length + 1),
      dateAndEmail
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

function getRemoteName(node?: TreeNode) {
  for (; node !== undefined; node = node?.parent) {
    if (node.parent === undefined) {
      return node.label;
    }
  }
  return undefined;
}

function getRemoteUrl(node?: TreeNode): string | undefined {
  return node?.tooltip?.toString();
}

const Refreshing: TreeNode = new TreeNode(
  undefined,
  '-',
  DEPENDENCY_TYPE.REFRESH,
  'Refreshing...'
);

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
