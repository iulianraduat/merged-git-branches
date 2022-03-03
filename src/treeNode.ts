import * as vscode from 'vscode';

export enum DEPENDENCY_TYPE {
  GIT_EXECUTABLE_MISSING,
  EMPTY,
  REMOTE,
  BRANCH,
  MERGED_BRANCH,
  MERGED_IN_BRANCH,
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

    this.iconPath = new vscode.ThemeIcon(this.getIconPath());
    this.tooltip = this.getTooltip();
    this.contextValue = this.getContextValue();
  }

  public update() {
    if (this.type === DEPENDENCY_TYPE.BRANCH && this.children.length > 0) {
      this.type = DEPENDENCY_TYPE.MERGED_BRANCH;
      this.contextValue = this.getContextValue();
    }
  }

  private getIconPath() {
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
    }
  }

  private getTooltip() {
    return this.description || this.label;
  }

  private getContextValue(): string | undefined {
    switch (this.type) {
      case DEPENDENCY_TYPE.GIT_EXECUTABLE_MISSING:
        return undefined;
      case DEPENDENCY_TYPE.EMPTY:
        return undefined;
      case DEPENDENCY_TYPE.REMOTE:
        return 'remote';
      case DEPENDENCY_TYPE.BRANCH:
        return 'branch';
      case DEPENDENCY_TYPE.MERGED_BRANCH:
        return 'mergedBranch';
      case DEPENDENCY_TYPE.MERGED_IN_BRANCH:
        return 'mergedInBranch';
    }
  }
}

export interface Remote {
  name: string;
  url: string;
}
