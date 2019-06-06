import * as vscode from 'vscode';

import * as kuberesources from '../../kuberesources';
import { ClusterExplorerResourceNode } from './node.resource';

export class NamespaceResourceNode extends ClusterExplorerResourceNode {
    constructor(readonly kind: kuberesources.ResourceKind, readonly id: string, readonly metadata?: any) {
        super(kind, id, metadata);
    }
    async getTreeItem(): Promise<vscode.TreeItem> {
        const treeItem = await super.getTreeItem();
        treeItem.contextValue = `vsKubernetes.resource.${this.kind.abbreviation}`;
        if (this.metadata.active) {
            treeItem.label = "* " + treeItem.label;
        }
        else {
            treeItem.contextValue += ".inactive";
        }
        return treeItem;
    }
}
