import * as vscode from 'vscode';

export enum DEPENDENCY_TYPE {
  GIT_EXECUTABLE_MISSING,
  EMPTY,
  REMOTE,
  BRANCH,
  MERGED_BRANCH,
  MERGED_IN_BRANCH,
  REFRESH,
}

export class TreeNode extends vscode.TreeItem {
  public children: TreeNode[] = [];

  constructor(
    public readonly parent: TreeNode | undefined,
    public readonly id: string,
    private type: DEPENDENCY_TYPE,
    public readonly label: string,
    public readonly description?: string,
    public collapsibleState?: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);

    this.iconPath = new vscode.ThemeIcon(this.getIconName());
    this.tooltip = this.getTooltip();
    this.contextValue = this.getContextValue();
  }

  public clone(): TreeNode {
    const newNode = new TreeNode(
      this.parent,
      this.id + Math.random(),
      this.type,
      this.label,
      this.description,
      this.collapsibleState,
      this.command
    );
    newNode.children = this.children.map((child) => child.clone());
    return newNode;
  }

  public update() {
    if (this.type === DEPENDENCY_TYPE.BRANCH && this.children.length > 0) {
      this.type = DEPENDENCY_TYPE.MERGED_BRANCH;
      this.contextValue = this.getContextValue();
    }
  }

  private getIconName() {
    switch (this.type) {
      case DEPENDENCY_TYPE.GIT_EXECUTABLE_MISSING:
        return 'alert';
      case DEPENDENCY_TYPE.EMPTY:
        return 'alert';
      case DEPENDENCY_TYPE.REMOTE:
        return 'database';
      case DEPENDENCY_TYPE.BRANCH:
        return 'git-branch';
      case DEPENDENCY_TYPE.MERGED_BRANCH:
        return 'git-branch';
      case DEPENDENCY_TYPE.MERGED_IN_BRANCH:
        return 'git-merge';
      case DEPENDENCY_TYPE.REFRESH:
        return 'refresh';
    }
  }

  private getTooltip() {
    return this.description || this.label;
  }

  private getContextValue(): string | undefined {
    switch (this.type) {
      case DEPENDENCY_TYPE.REMOTE:
        return 'remote';
      case DEPENDENCY_TYPE.BRANCH:
        return 'branch';
      case DEPENDENCY_TYPE.MERGED_BRANCH:
        return 'mergedBranch';
      case DEPENDENCY_TYPE.MERGED_IN_BRANCH:
        return 'mergedInBranch';
      default:
        return undefined;
    }
  }
}

export interface Remote {
  name: string;
  url: string;
}
