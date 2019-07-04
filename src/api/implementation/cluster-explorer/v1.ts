import * as vscode from 'vscode';

import { ClusterExplorerV1 } from "../../contract/cluster-explorer/v1";
import { ExplorerExtender, ExplorerUICustomizer } from "../../../components/clusterexplorer/explorer.extension";
import { KUBERNETES_EXPLORER_NODE_CATEGORY, KubernetesExplorer } from "../../../components/clusterexplorer/explorer";
import { Kubectl } from "../../../kubectl";
import { Host } from "../../../host";
import { CustomResourceFolderNodeSource, CustomGroupingFolderNodeSource, NodeSourceImpl, AllResourcesNodeSource } from "../../../components/clusterexplorer/extension.nodesources";
import { ClusterExplorerNode, ClusterExplorerResourceNode, ClusterExplorerCustomNode } from "../../../components/clusterexplorer/node";
import { ResourceKind } from '../../../kuberesources';

export function impl(explorer: KubernetesExplorer): ClusterExplorerV1 {
    return new ClusterExplorerV1Impl(explorer);
}

class ClusterExplorerV1Impl implements ClusterExplorerV1 {
    constructor(private readonly explorer: KubernetesExplorer) {}

    resolveCommandTarget(target?: any): ClusterExplorerV1.ClusterExplorerNode | undefined {
        if (!target) {
            return undefined;
        }
        if (target.nodeCategory === KUBERNETES_EXPLORER_NODE_CATEGORY) {
            const implNode = target as ClusterExplorerNode;
            const apiNode = adaptKubernetesExplorerNode(implNode);
            return apiNode;
        }
        return undefined;
    }

    registerNodeContributor(nodeContributor: ClusterExplorerV1.NodeContributor): void {
        const adapted = extenderOf(nodeContributor);
        this.explorer.registerExtender(adapted);
    }

    registerNodeUICustomizer(nodeUICustomizer: ClusterExplorerV1.NodeUICustomizer): void {
        const adapted = adaptToExplorerUICustomizer(nodeUICustomizer);
        this.explorer.registerUICustomiser(adapted);
    }

    get nodeSources(): ClusterExplorerV1.NodeSources {
        return {
            resourceFolder: resourceFolderSource,
            groupingFolder: groupingFolderSource,
            resources: resourcesSources
        };
    }

    refresh(): void {
        this.explorer.refresh();
    }
}

function adaptToExplorerUICustomizer(nodeUICustomizer: ClusterExplorerV1.NodeUICustomizer): ExplorerUICustomizer<ClusterExplorerNode> {
    return new NodeUICustomizerAdapter(nodeUICustomizer);
}

class NodeContributorAdapter implements ExplorerExtender<ClusterExplorerNode> {
    constructor(private readonly impl: ClusterExplorerV1.NodeContributor) {}
    contributesChildren(parent?: ClusterExplorerNode | undefined): boolean {
        const parentNode = parent ? adaptKubernetesExplorerNode(parent) : undefined;
        return this.impl.contributesChildren(parentNode);
    }
    async getChildren(_kubectl: Kubectl, _host: Host, parent?: ClusterExplorerNode | undefined): Promise<ClusterExplorerNode[]> {
        const parentNode = parent ? adaptKubernetesExplorerNode(parent) : undefined;
        const children = await this.impl.getChildren(parentNode);
        return children.map(internalNodeOf);
    }
}

class NodeUICustomizerAdapter implements ExplorerUICustomizer<ClusterExplorerNode> {
    constructor(private readonly impl: ClusterExplorerV1.NodeUICustomizer) {}
    customize(element: ClusterExplorerNode, treeItem: vscode.TreeItem): true | Thenable<true> {
        const waiter = this.impl.customize(adaptKubernetesExplorerNode(element), treeItem);
        if (waiter) {
            return waitFor(waiter);
        }
        return true;
    }
}

async function waitFor(waiter: Thenable<void>): Promise<true> {
    await waiter;
    return true;
}

function adaptKubernetesExplorerNode(node: ClusterExplorerNode): ClusterExplorerV1.ClusterExplorerNode {
    switch (node.nodeType) {
        case 'error':
            return { nodeType: 'error' };
        case 'context':
            return node.kubectlContext.active ?
                { nodeType: 'context', name: node.contextName } :
                { nodeType: 'context.inactive', name: node.contextName };
        case 'folder.grouping':
            return { nodeType: 'folder.grouping' };
        case 'folder.resource':
            return { nodeType: 'folder.resource', resourceKind: node.kind };
        case 'resource':
            return adaptKubernetesExplorerResourceNode(node);
        case 'configitem':
            return { nodeType: 'configitem', name: node.key };
        case 'helm.release':
            return { nodeType: 'helm.release', name: node.releaseName };
        case 'extension':
            return { nodeType: 'extension' };
    }
}

function adaptKubernetesExplorerResourceNode(node: ClusterExplorerResourceNode): ClusterExplorerV1.ClusterExplorerResourceNode {
    return {
        nodeType: 'resource',
        metadata: node.metadata,
        name: node.name,
        resourceKind: node.kind,
        namespace: node.namespace
    };
}

export class ContributedNode implements ClusterExplorerCustomNode {
    readonly nodeCategory = 'kubernetes-explorer-node';
    readonly nodeType = 'extension';

    constructor(private readonly impl: ClusterExplorerV1.Node) { }

    async getChildren(_kubectl: Kubectl, _host: Host): Promise<ClusterExplorerNode[]> {
        return (await this.impl.getChildren()).map((n) => internalNodeOf(n));
    }
    getTreeItem(): vscode.TreeItem {
        return this.impl.getTreeItem();
    }
}

function resourceFolderSource(displayName: string, pluralDisplayName: string, manifestKind: string, abbreviation: string): ClusterExplorerV1.NodeSource {
    const nodeSource = new CustomResourceFolderNodeSource(new ResourceKind(displayName, pluralDisplayName, manifestKind, abbreviation));
    return wrapNS(nodeSource);
}

function groupingFolderSource(displayName: string, contextValue: string | undefined, ...children: ClusterExplorerV1.NodeSource[]): ClusterExplorerV1.NodeSource {
    const nodeSource = new CustomGroupingFolderNodeSource(displayName, contextValue, children.map(nsImpl));
    return wrapNS(nodeSource);
}

function allResourcesSource(manifestKind: string, abbreviation: string): ClusterExplorerV1.NodeSource {
    const nodeSource = new AllResourcesNodeSource(manifestKind, abbreviation);
    return wrapNS(nodeSource);
}

function resourcesSources(manifestKind: string, abbreviation: string) {
    return {
        all() { return allResourcesSource(manifestKind, abbreviation); },
        fromQuery(_kubectlGetOptions: string) { return resourceFolderSource(abbreviation, abbreviation, manifestKind, abbreviation); },
    };
}

const BUILT_IN_CONTRIBUTOR_KIND_TAG = 'nativeextender-4a4bc473-a8c6-4b1e-973f-22327f99cea8';
const BUILT_IN_NODE_KIND_TAG = 'nativenode-5be3c876-3683-44cd-a400-7763d2c4302a';
const BUILT_IN_NODE_SOURCE_KIND_TAG = 'nativenodesource-aa0c30a9-bf1d-444a-a147-7823edcc7c04';

interface BuiltInNodeContributor {
    readonly [BUILT_IN_CONTRIBUTOR_KIND_TAG]: true;
    readonly impl: ExplorerExtender<ClusterExplorerNode>;
}

interface BuiltInNodeSource {
    readonly [BUILT_IN_NODE_SOURCE_KIND_TAG]: true;
    readonly impl: NodeSourceImpl;
}

interface BuiltInNode {
    readonly [BUILT_IN_NODE_KIND_TAG]: true;
    readonly impl: ClusterExplorerNode;
}

function wrapNS(nodeSet: NodeSourceImpl): ClusterExplorerV1.NodeSource & BuiltInNodeSource {
    return {
        at(parent: string | undefined) { const ee = nodeSet.at(parent); return wrapAsNC(ee); },
        if(condition: () => boolean | Thenable<boolean>) { return wrapNS(nodeSet.if(condition)); },
        async nodes() { throw new Error("Don't call the interface nodes() method - it should only ever be called on the built-in implementation"); },
        [BUILT_IN_NODE_SOURCE_KIND_TAG]: true,
        impl: nodeSet
    };
}

function isBuiltInNodeSource(nodeSet: ClusterExplorerV1.NodeSource): nodeSet is ClusterExplorerV1.NodeSource & BuiltInNodeSource {
    return (<any>nodeSet)[BUILT_IN_NODE_SOURCE_KIND_TAG] === true;
}

function nsImpl(nodeSource: ClusterExplorerV1.NodeSource): NodeSourceImpl {
    if (isBuiltInNodeSource(nodeSource)) {
        return nodeSource.impl;
    }
    throw new Error("Don't implement the NodeSource interface yourself");
}

function isBuiltInNodeContributor(nodeContributor: ClusterExplorerV1.NodeContributor): nodeContributor is ClusterExplorerV1.NodeContributor & BuiltInNodeContributor {
    return (<any>nodeContributor)[BUILT_IN_CONTRIBUTOR_KIND_TAG] === true;
}

function extenderOf(nodeContributor: ClusterExplorerV1.NodeContributor): ExplorerExtender<ClusterExplorerNode> {
    if (isBuiltInNodeContributor(nodeContributor)) {
        return nodeContributor.impl;
    }
    return new NodeContributorAdapter(nodeContributor);
}

function wrapAsNC(ee: ExplorerExtender<ClusterExplorerNode>): ClusterExplorerV1.NodeContributor & BuiltInNodeContributor {
    return {
        contributesChildren(_parent) { return false; },
        async getChildren(_parent) { return []; },
        [BUILT_IN_CONTRIBUTOR_KIND_TAG]: true,
        impl: ee
    };
}

function isBuiltInNode(node: ClusterExplorerV1.Node): node is ClusterExplorerV1.Node & BuiltInNode {
    return (<any>node)[BUILT_IN_NODE_KIND_TAG] === true;
}

export function internalNodeOf(node: ClusterExplorerV1.Node): ClusterExplorerNode {
    if (isBuiltInNode(node)) {
        return node.impl;
    }
    return new ContributedNode(node);
}
