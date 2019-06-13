import * as kuberesources from '../../kuberesources';
import { ExplorerExtender } from './explorer.extension';
import { ClusterExplorerNode, ClusterExplorerResourceNode } from './node';
import { ContextNode } from './node.context';
import { FolderNode } from './node.folder';
import { ContributedGroupingFolderNode } from './node.folder.grouping.custom';
import { ResourceFolderNode } from './node.folder.resource';
import { ResourceNode } from './node.resource';
import { ResourceKindUIDescriptor, ResourceChildSource, ResourceLister, kindUIDescriptor } from './resourceui';
import { Kubectl } from '../../kubectl';
import { flatten } from '../../utils/array';
import { cantHappen } from '../../utils/never';
import { Host } from '../../host';

export abstract class NodeSourceImpl {
    at(parent: string | undefined): ExplorerExtender<ClusterExplorerNode> {
        return new ContributedNodeSourceExtender(parent, this);
    }
    if(condition: () => boolean | Thenable<boolean>): NodeSourceImpl {
        return new ConditionalNodeSource(this, condition);
    }
    filter(predicate: (c: ClusterExplorerNode) => boolean): NodeSourceImpl {
        return new FilteringNodeSource(this, predicate);
    }
    abstract nodes(): Promise<ClusterExplorerNode[]>;
}

class FilteringNodeSource extends NodeSourceImpl {
    constructor(private readonly source: NodeSourceImpl, private readonly predicate: (c: ClusterExplorerNode) => boolean) {
        super();
    }
    async nodes(): Promise<ClusterExplorerNode[]> {
        const ns = await this.source.nodes();
        return ns.filter(this.predicate);
    }
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
    constructor(private readonly resourceKind: kuberesources.ResourceKind, private readonly resources: () => NodeSourceImpl[]) {
        super();
    }
    async nodes(): Promise<ClusterExplorerNode[]> {
        const resourcesFunc = this.resources;
        const lister: ResourceLister = {
            async list(_kubectl: Kubectl, _kind: kuberesources.ResourceKind): Promise<ClusterExplorerNode[]> {
                const nss = resourcesFunc();
                const nps = nss.map((ns) => ns.nodes());
                const narrs = await Promise.all(nps);
                return flatten(...narrs);
            }
        };
        const uiDescriptor = {
            kind: this.resourceKind,
            lister: lister,
        };
        return [ResourceFolderNode.create(this.resourceKind, uiDescriptor)];
    }
}

interface RSA {
    readonly resources: 'all';
}

interface RSCB {
    readonly resources: 'cb';
    list(): Promise<ReadonlyArray<{ name: string, extraInfo?: any }>>;
}

interface RSL {
    readonly resources: 'list';
    list: ReadonlyArray<{ name: string, extraInfo?: any }>;
}

export class CustomResourcesOfNodeSource extends NodeSourceImpl {
    constructor(private readonly kubectl: Kubectl, private readonly host: Host,
        private readonly resourceKind: kuberesources.ResourceKind,
        private readonly resources: RSA | RSCB | RSL,
        private readonly _children: undefined | ((resource: { name: string; extraInfo: any; }) => NodeSourceImpl)) {
        super();
    }
    async nodes(): Promise<ClusterExplorerNode[]> {
        // const childrenFunc = this.children;
        // const childSource: ResourceChildSource = {
        //     children(_kubectl: Kubectl, parent: ResourceNode): Promise<ClusterExplorerNode[]> {
        //         const extraInfo = parent.extraInfo ? parent.extraInfo.custom : undefined;
        //         const ns = childrenFunc!({ name: parent.name, extraInfo: extraInfo});
        //         return ns.nodes();
        //     }
        // };
        // const childSources = this.children ? [childSource] : [];
        // const baseUIDescriptor = kindUIDescriptor(this.resourceKind);
        // const uiDescriptor: ResourceKindUIDescriptor = {
        //     kind: this.resourceKind,
        //     childSources: childSources.concat(baseUIDescriptor.childSources || [])
        // };
        switch (this.resources.resources) {
            case 'all':
                const resourceInfos = await ResourceFolderNode.create(this.resourceKind, undefined /*uiDescriptor*/).getChildren(this.kubectl, this.host);
                return resourceInfos.filter((ri) => ri.nodeType === 'resource')
                                    .map((ri) => ri as ClusterExplorerResourceNode)
                                    .map((ri) => ResourceNode.create(ri.kind, ri.name, ri.metadata, ri.extraInfo, undefined /*uiDescriptor*/));
            case 'cb':
                return (await this.resources.list()).map((r) => ResourceNode.create(this.resourceKind, r.name, undefined, { custom: r.extraInfo }, undefined /*uiDescriptor*/));
            case 'list':
                return this.resources.list.map((r) => ResourceNode.create(this.resourceKind, r.name, undefined, { custom: r.extraInfo }, undefined /*uiDescriptor*/));
            default:
                return cantHappen(this.resources);
        }
    }
}

export class CustomResourceOfNodeSource extends NodeSourceImpl {
    constructor(private readonly resourceKind: kuberesources.ResourceKind, private readonly resource: { name: string; extraInfo: any; }, private readonly _children: undefined | (() => NodeSourceImpl)) {
        super();
    }
    async nodes(): Promise<ClusterExplorerNode[]> {
        // const childrenFunc = this.children;
        // const childSource: ResourceChildSource = {
        //     children(_kubectl: Kubectl, _parent: ResourceNode): Promise<ClusterExplorerNode[]> {
        //         const ns = childrenFunc!();
        //         return ns.nodes();
        //     }
        // };
        // const childSources = this.children ? [childSource] : [];
        // const baseUIDescriptor = kindUIDescriptor(this.resourceKind);
        // const uiDescriptor: ResourceKindUIDescriptor = {
        //     kind: this.resourceKind,
        //     childSources: childSources.concat(baseUIDescriptor.childSources || [])
        // };
        return [ResourceNode.create(this.resourceKind, this.resource.name, undefined, { custom: this.resource.extraInfo }, undefined)]; // uiDescriptor)];
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
