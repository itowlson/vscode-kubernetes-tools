import * as kuberesources from '../../kuberesources';
import { ExplorerExtender } from './explorer.extension';
import { ClusterExplorerNode } from './node';
import { ContextNode } from './node.context';
import { FolderNode } from './node.folder';
import { ContributedGroupingFolderNode } from './node.folder.grouping.custom';
import { ResourceFolderNode } from './node.folder.resource';
import { failed } from '../../errorable';
import { MessageNode } from './node.message';
import { ResourceNode } from './node.resource';
import { Kubectl } from '../../kubectl';
import { Host } from '../../host';

export abstract class NodeSourceImpl {
    at(parent: string | undefined): ExplorerExtender<ClusterExplorerNode> {
        return new ContributedNodeSourceExtender(parent, this);
    }
    if(condition: () => boolean | Thenable<boolean>): NodeSourceImpl {
        return new ConditionalNodeSource(this, condition);
    }
    abstract nodes(kubectl: Kubectl, host: Host): Promise<ClusterExplorerNode[]>;
}

export class CustomResourceFolderNodeSource extends NodeSourceImpl {
    constructor(private readonly resourceKind: kuberesources.ResourceKind) {
        super();
    }
    async nodes(_kubectl: Kubectl, _host: Host): Promise<ClusterExplorerNode[]> {
        return [ResourceFolderNode.create(this.resourceKind)];
    }
}

export class AllResourcesNodeSource extends NodeSourceImpl {
    private readonly kind: kuberesources.ResourceKind;
    constructor(manifestKind: string, abbreviation: string) {
        super();
        this.kind = new kuberesources.ResourceKind(manifestKind, manifestKind, manifestKind, abbreviation);
    }
    async nodes(kubectl: Kubectl, host: Host): Promise<ClusterExplorerNode[]> {
        const childrenLines = await kubectl.asLines(`get ${this.kind.abbreviation}`);
        if (failed(childrenLines)) {
            host.showErrorMessage(childrenLines.error[0]);
            return [new MessageNode("Error")];
        }
        return childrenLines.result.map((line) => {
            const bits = line.split(' ');
            return ResourceNode.create(this.kind, bits[0], undefined, undefined);
        });
    }
}

export class CustomGroupingFolderNodeSource extends NodeSourceImpl {
    constructor(private readonly displayName: string, private readonly contextValue: string | undefined, private readonly children: NodeSourceImpl[]) {
        super();
    }
    async nodes(_kubectl: Kubectl, _host: Host): Promise<ClusterExplorerNode[]> {
        return [new ContributedGroupingFolderNode(this.displayName, this.contextValue, this.children)];
    }
}

class ConditionalNodeSource extends NodeSourceImpl {
    constructor(private readonly impl: NodeSourceImpl, private readonly condition: () => boolean | Thenable<boolean>) {
        super();
    }
    async nodes(kubectl: Kubectl, host: Host): Promise<ClusterExplorerNode[]> {
        if (await this.condition()) {
            return this.impl.nodes(kubectl, host);
        }
        return [];
    }
}

export class ContributedNodeSourceExtender implements ExplorerExtender<ClusterExplorerNode> {
    constructor(private readonly under: string | undefined, private readonly nodeSource: NodeSourceImpl) { }
    contributesChildren(parent?: ClusterExplorerNode | undefined): boolean {
        if (!parent) {
            return false;
        }
        if (this.under) {
            return parent.nodeType === 'folder.grouping' && (parent as FolderNode).displayName === this.under;
        }
        return parent.nodeType === 'context' && (parent as ContextNode).kubectlContext.active;
    }
    getChildren(kubectl: Kubectl, host: Host, _parent?: ClusterExplorerNode | undefined): Promise<ClusterExplorerNode[]> {
        return this.nodeSource.nodes(kubectl, host);
    }
}
