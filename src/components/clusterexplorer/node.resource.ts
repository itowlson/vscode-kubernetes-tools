import * as vscode from 'vscode';

import { Kubectl } from '../../kubectl';
import * as kubectlUtils from '../../kubectlUtils';
import { Host } from '../../host';
import * as kuberesources from '../../kuberesources';
import { ObjectMeta } from '../../kuberesources.objectmodel';
import { kubefsUri } from '../../kuberesources.virtualfs';
import { ClusterExplorerNode, ClusterExplorerNodeImpl, ClusterExplorerResourceNode } from './node';
import { getChildSources, getUICustomiser, ResourceKindUIDescriptor, kindUIDescriptor } from './resourceui';
import { HACKETY_HACK_kindUIDescriptors } from './explorer';

export class ResourceNode extends ClusterExplorerNodeImpl implements ClusterExplorerResourceNode {

    static create(kind: kuberesources.ResourceKind, name: string, metadata: ObjectMeta | undefined, extraInfo: ResourceExtraInfo | undefined, uiDescriptor?: ResourceKindUIDescriptor): ClusterExplorerResourceNode {
        const actualUIDescriptor = uiDescriptor || HACKETY_HACK_kindUIDescriptors.find((d) => d.kind.manifestKind === kind.manifestKind) || kindUIDescriptor(kind);
        return new ResourceNode(kind, name, metadata, extraInfo, actualUIDescriptor);
    }

    readonly kindName: string;
    readonly nodeType = 'resource';
    constructor(readonly kind: kuberesources.ResourceKind, readonly name: string, readonly metadata: ObjectMeta | undefined, readonly extraInfo: ResourceExtraInfo | undefined, private readonly uiDescriptor: ResourceKindUIDescriptor) {
        super("resource");
        this.kindName = `${kind.abbreviation}/${name}`;
    }
    get namespace(): string | null {
        return (this.metadata && this.metadata.namespace) ? this.metadata.namespace : null;
    }
    uri(outputFormat: string): vscode.Uri {
        return kubefsUri(this.namespace, this.kindName, outputFormat);
    }
    async getChildren(kubectl: Kubectl, _host: Host): Promise<ClusterExplorerNode[]> {
        const childSources = getChildSources(this.uiDescriptor);
        const children = Array.of<ClusterExplorerNode>();
        for (const source of childSources) {
            const sourcedChildren = await source.children(kubectl, this);
            children.push(...sourcedChildren);
        }
        return children;
    }
    getTreeItem(): vscode.TreeItem | Thenable<vscode.TreeItem> {
        const collapsibleState = this.isExpandable ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        const treeItem = new vscode.TreeItem(this.name, collapsibleState);
        treeItem.command = {
            command: "extension.vsKubernetesLoad",
            title: "Load",
            arguments: [this]
        };
        treeItem.contextValue = `vsKubernetes.resource.${this.kind.abbreviation}`;
        if (this.namespace) {
            treeItem.tooltip = `Namespace: ${this.namespace}`; // TODO: show only if in non-current namespace?
        }
        const uiCustomiser = getUICustomiser(this.uiDescriptor);
        uiCustomiser.customiseTreeItem(this, treeItem);
        return treeItem;
    }
    get isExpandable(): boolean {
        return getChildSources(this.uiDescriptor).length > 0;
    }
}

export interface ResourceExtraInfo {
    readonly configData?: any;
    readonly podInfo?: kubectlUtils.PodInfo;
    readonly labelSelector?: any;
    readonly namespaceInfo?: kubectlUtils.NamespaceInfo;
    readonly custom?: any;
}
