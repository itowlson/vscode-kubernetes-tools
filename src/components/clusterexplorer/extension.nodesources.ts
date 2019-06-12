import * as kuberesources from '../../kuberesources';
import { ExplorerExtender } from './explorer.extension';
import { ClusterExplorerNode } from './node';
import { ContextNode } from './node.context';
import { FolderNode } from './node.folder';
import { ContributedGroupingFolderNode } from './node.folder.grouping.custom';
import { ResourceFolderNode } from './node.folder.resource';
import { ResourceNode } from './node.resource';
import { ResourceKindUIDescriptor, ResourceChildSource } from './resourceui';
import { Kubectl } from '../../kubectl';
import { GroupingFolderNode } from './node.folder.grouping';

export abstract class NodeSourceImpl {
    at(parent: string | undefined): ExplorerExtender<ClusterExplorerNode> {
        return new ContributedNodeSourceExtender(parent, this);
    }
    if(condition: () => boolean | Thenable<boolean>): NodeSourceImpl {
        return new ConditionalNodeSource(this, condition);
    }
    abstract nodes(): Promise<ClusterExplorerNode[]>;
}

export class CustomResourceFolderNodeSource extends NodeSourceImpl {
    constructor(private readonly resourceKind: kuberesources.ResourceKind) {
        super();
    }
    async nodes(): Promise<ClusterExplorerNode[]> {
        return [ResourceFolderNode.create(this.resourceKind)];
    }
}

export class CustomGroupingFolderNodeSource extends NodeSourceImpl {
    constructor(private readonly displayName: string, private readonly contextValue: string | undefined, private readonly children: NodeSourceImpl[]) {
        super();
    }
    async nodes(): Promise<ClusterExplorerNode[]> {
        return [new ContributedGroupingFolderNode(this.displayName, this.contextValue, this.children)];
    }
}

export class CustomResourceFolderOfNodeSource extends NodeSourceImpl {
    constructor(private readonly resourceKind: kuberesources.ResourceKind, private readonly resources: () => any[]) {
        super();
    }
    async nodes(): Promise<ClusterExplorerNode[]> {
        return [GroupingFolderNode.of("TODO: do it", "TODO: TODO: TODO: no really you have to do this bit Ivan")];
    }
}

export class CustomResourcesOfNodeSource extends NodeSourceImpl {
    constructor(private readonly resourceKind: kuberesources.ResourceKind, private readonly resources: { name: string; extraInfo: any; }[], private readonly children: undefined | ((resource: { name: string; extraInfo: any; }) => NodeSourceImpl)) {
        super();
    }
    async nodes(): Promise<ClusterExplorerNode[]> {
        const childrenFunc = this.children;
        const childSource: ResourceChildSource = {
            children(_kubectl: Kubectl, parent: ResourceNode): Promise<ClusterExplorerNode[]> {
                const extraInfo = parent.extraInfo ? parent.extraInfo.custom : undefined;
                const ns = childrenFunc!({ name: parent.name, extraInfo: extraInfo});
                return ns.nodes();
            }
        };
        const childSources = this.children ? [childSource] : [];
        const uiDescriptor: ResourceKindUIDescriptor = {
            kind: this.resourceKind,
            childSources: childSources
        };
        return this.resources.map((r) => ResourceNode.create(this.resourceKind, r.name, undefined, { custom: r.extraInfo }, uiDescriptor));
    }
}

export class CustomResourceOfNodeSource extends NodeSourceImpl {
    constructor(private readonly resourceKind: kuberesources.ResourceKind, private readonly resource: { name: string; extraInfo: any; }, private readonly children: undefined | (() => NodeSourceImpl)) {
        super();
    }
    async nodes(): Promise<ClusterExplorerNode[]> {
        const childrenFunc = this.children;
        const childSource: ResourceChildSource = {
            children(_kubectl: Kubectl, _parent: ResourceNode): Promise<ClusterExplorerNode[]> {
                const ns = childrenFunc!();
                return ns.nodes();
            }
        };
        const childSources = this.children ? [childSource] : [];
        const uiDescriptor: ResourceKindUIDescriptor = {
            kind: this.resourceKind,
            childSources: childSources
        };
        return [ResourceNode.create(this.resourceKind, this.resource.name, undefined, { custom: this.resource.extraInfo }, uiDescriptor)];
    }
}

class ConditionalNodeSource extends NodeSourceImpl {
    constructor(private readonly impl: NodeSourceImpl, private readonly condition: () => boolean | Thenable<boolean>) {
        super();
    }
    async nodes(): Promise<ClusterExplorerNode[]> {
        if (await this.condition()) {
            return this.impl.nodes();
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
    getChildren(_parent?: ClusterExplorerNode | undefined): Promise<ClusterExplorerNode[]> {
        return this.nodeSource.nodes();
    }
}
