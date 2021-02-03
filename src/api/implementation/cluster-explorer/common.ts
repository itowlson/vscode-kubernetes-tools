/* eslint-disable camelcase */

import * as vscode from 'vscode';
import { KUBERNETES_EXPLORER_NODE_CATEGORY } from "../../../components/clusterexplorer/explorer";
import { ExplorerExtender, ExplorerUICustomizer } from "../../../components/clusterexplorer/explorer.extension";
import { CustomGroupingFolderNodeSource, CustomResourceFolderNodeSource, NodeSourceImpl } from "../../../components/clusterexplorer/extension.nodesources";
import { ClusterExplorerCustomNode, ClusterExplorerNode, ClusterExplorerResourceNode } from "../../../components/clusterexplorer/node";
import { Host } from "../../../host";
import { Kubectl } from "../../../kubectl";
import { ResourceKind } from '../../../kuberesources';

import { ClusterExplorerV1 } from '../../contract/cluster-explorer/v1';
import { ClusterExplorerV1_1 } from '../../contract/cluster-explorer/v1_1';
import { ClusterExplorerV1_2 } from '../../contract/cluster-explorer/v1_2';

// export interface NodeContributor {
//     contributesChildren(parent: ClusterExplorerV1_2.ClusterExplorerNode | undefined): boolean;
//     getChildren(parent: ClusterExplorerV1_2.ClusterExplorerNode | undefined): Promise<Node[]>;
// }

export interface NodeLike {
    getChildren(): Promise<NodeLike[]>;
    getTreeItem(): vscode.TreeItem;
}

// export interface NodeSource {
//     at(parentFolder: string | undefined): NodeContributor;
//     if(condition: () => boolean | Thenable<boolean>): NodeSource;
//     nodes(): Promise<Node[]>;
// }

export function resolveCommandTarget(target?: any): ClusterExplorerV1_2.ClusterExplorerNode | undefined {
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

export function resolveCommandTarget11(target?: any): (ClusterExplorerV1.ClusterExplorerNode & ClusterExplorerV1_1.ClusterExplorerNode) | undefined {
    return nodeTo11(resolveCommandTarget(target));
}

function nodeTo11(node: ClusterExplorerV1_2.ClusterExplorerNode | undefined): (ClusterExplorerV1.ClusterExplorerNode & ClusterExplorerV1_1.ClusterExplorerNode) | undefined {
    if (!node) {
        return node;
    }
    return nodeTo11Total(node);
}

function nodeTo11Total(node: ClusterExplorerV1_2.ClusterExplorerNode): (ClusterExplorerV1.ClusterExplorerNode & ClusterExplorerV1_1.ClusterExplorerNode) {
    switch (node.nodeType) {
        case 'helm.history':
        case 'unrenderable':
            return { nodeType: 'extension' };
        default:
            return node;
    }
}

export function adaptToExplorerUICustomizer(nodeUICustomizer: ClusterExplorerV1_2.NodeUICustomizer): ExplorerUICustomizer<ClusterExplorerNode> {
    return new NodeUICustomizerAdapter(nodeUICustomizer);
}

class NodeUICustomizerAdapter implements ExplorerUICustomizer<ClusterExplorerNode> {
    constructor(private readonly impl: ClusterExplorerV1_2.NodeUICustomizer) {}
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

export class NodeContributorAdapter implements ExplorerExtender<ClusterExplorerNode> {
    constructor(private readonly impl: ClusterExplorerV1_2.NodeContributor) {}
    contributesChildren(parent?: ClusterExplorerNode | undefined): boolean {
        const parentNode = parent ? adaptKubernetesExplorerNode(parent) : undefined;
        return this.impl.contributesChildren(parentNode);
    }
    async getChildren(parent?: ClusterExplorerNode | undefined): Promise<ClusterExplorerNode[]> {
        const parentNode = parent ? adaptKubernetesExplorerNode(parent) : undefined;
        const children = await this.impl.getChildren(parentNode);
        return children.map(internalNodeOf);
    }
}

export interface NC<PN, CN> {
    contributesChildren(parent: PN | undefined): boolean;
    getChildren(parent: PN | undefined): Promise<CN[]>;
}

export class NodeContributorAdapter2<C extends NC<PN, CN>, PN, CN extends NodeLike> implements ExplorerExtender<ClusterExplorerNode> {
    constructor(private readonly impl: C, private readonly adaptNode: (n: ClusterExplorerNode) => PN) {}
    contributesChildren(parent?: ClusterExplorerNode | undefined): boolean {
        const parentNode = parent ? this.adaptNode(parent) : undefined;
        return this.impl.contributesChildren(parentNode);
    }
    async getChildren(parent?: ClusterExplorerNode | undefined): Promise<ClusterExplorerNode[]> {
        const parentNode = parent ? this.adaptNode(parent) : undefined;
        const children = await this.impl.getChildren(parentNode);
        return children.map(internalNodeOfG);
    }
}


function adaptKubernetesExplorerNode(node: ClusterExplorerNode): ClusterExplorerV1_2.ClusterExplorerNode {
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
        case 'helm.history':
            return { nodeType: 'helm.history' };
        case 'extension':
            return { nodeType: 'extension' };
        default:
            return { nodeType: 'unrenderable' };
    }
}

function adaptKubernetesExplorerResourceNode(node: ClusterExplorerResourceNode): ClusterExplorerV1_2.ClusterExplorerResourceNode {
    return {
        nodeType: 'resource',
        metadata: node.metadata,
        name: node.name,
        resourceKind: node.kind,
        namespace: node.namespace
    };
}

export function allNodeSources(): ClusterExplorerV1_1.NodeSources & ClusterExplorerV1_2.NodeSources {
    return {
        resourceFolder: resourceFolderContributor,
        groupingFolder: groupingFolderContributor
    };
}

export function allNodeSources1(): ClusterExplorerV1.NodeSources {
    return {
        resourceFolder: resourceFolderContributor1,
        groupingFolder: groupingFolderContributor1
    };
}

const BUILT_IN_CONTRIBUTOR_KIND_TAG = 'nativeextender-4a4bc473-a8c6-4b1e-973f-22327f99cea8';
const BUILT_IN_NODE_KIND_TAG = 'nativek8sobject-5be3c876-3683-44cd-a400-7763d2c4302a';
const BUILT_IN_NODE_SOURCE_KIND_TAG = 'nativenodesource-aa0c30a9-bf1d-444a-a147-7823edcc7c04';

export interface BuiltInNodeContributor {
    readonly [BUILT_IN_CONTRIBUTOR_KIND_TAG]: true;
    readonly impl: ExplorerExtender<ClusterExplorerNode>;
}

export interface BuiltInNodeSource {
    readonly [BUILT_IN_NODE_SOURCE_KIND_TAG]: true;
    readonly impl: NodeSourceImpl;
}

export interface BuiltInNode {
    readonly [BUILT_IN_NODE_KIND_TAG]: true;
    readonly impl: ClusterExplorerNode;
}

export class ContributedNode implements ClusterExplorerCustomNode {
    readonly nodeCategory = 'kubernetes-explorer-node';
    readonly nodeType = 'extension';
    readonly id = 'dummy';

    constructor(private readonly impl: ClusterExplorerV1_2.Node) { }

    async getChildren(_kubectl: Kubectl, _host: Host): Promise<ClusterExplorerNode[]> {
        return (await this.impl.getChildren()).map((n) => internalNodeOf(n));
    }
    getTreeItem(): vscode.TreeItem {
        return this.impl.getTreeItem();
    }
    async apiURI(_kubectl: Kubectl, _namespace: string): Promise<string | undefined> {
        return undefined;
    }
}

export class ContributedNodeG<N extends NodeLike> implements ClusterExplorerCustomNode {
    readonly nodeCategory = 'kubernetes-explorer-node';
    readonly nodeType = 'extension';
    readonly id = 'dummy';

    constructor(private readonly impl: N) { }

    async getChildren(_kubectl: Kubectl, _host: Host): Promise<ClusterExplorerNode[]> {
        return (await this.impl.getChildren()).map((n) => internalNodeOf(n));
    }
    getTreeItem(): vscode.TreeItem {
        return this.impl.getTreeItem();
    }
    async apiURI(_kubectl: Kubectl, _namespace: string): Promise<string | undefined> {
        return undefined;
    }
}

export function apiNodeSourceOf(nodeSet: NodeSourceImpl): ClusterExplorerV1_1.NodeSource & ClusterExplorerV1_2.NodeSource & BuiltInNodeSource {
    return {
        at(parent: string | undefined) { const ee = nodeSet.at(parent); return apiNodeContributorOf(ee); },
        if(condition: () => boolean | Thenable<boolean>) { return apiNodeSourceOf(nodeSet.if(condition)); },
        async nodes() { return (await nodeSet.nodes()).map(apiNodeOf); },
        [BUILT_IN_NODE_SOURCE_KIND_TAG]: true,
        impl: nodeSet
    };
}

export function apiNodeSourceOf1(nodeSet: NodeSourceImpl): ClusterExplorerV1.NodeSource & BuiltInNodeSource {
    return {
        at(parent: string | undefined) { const ee = nodeSet.at(parent); return apiNodeContributorOf(ee); },
        if(condition: () => boolean | Thenable<boolean>) { return apiNodeSourceOf1(nodeSet.if(condition)); },
        async nodes() { return (await nodeSet.nodes()).map(apiNodeOf); },
        [BUILT_IN_NODE_SOURCE_KIND_TAG]: true,
        impl: nodeSet
    };
}

export function apiNodeContributorOf(ee: ExplorerExtender<ClusterExplorerNode>): ClusterExplorerV1.NodeContributor & ClusterExplorerV1_1.NodeContributor & ClusterExplorerV1_2.NodeContributor & BuiltInNodeContributor {
    return {
        contributesChildren(_parent: any) { return false; },
        async getChildren(_parent: any) { return []; },
        [BUILT_IN_CONTRIBUTOR_KIND_TAG]: true,
        impl: ee
    };
}

export function apiNodeOf(node: ClusterExplorerNode): (ClusterExplorerV1.Node & ClusterExplorerV1_1.Node & ClusterExplorerV1_2.Node) & BuiltInNode {
    return {
        async getChildren() { throw new Error('apiNodeOf->getChildren: not expected to be called directly'); },
        getTreeItem() { throw new Error('apiNodeOf->getTreeItem: not expected to be called directly'); },
        [BUILT_IN_NODE_KIND_TAG]: true,
        impl: node
    };
}

type NodeSourceVersioned =
    { v: "1"; s: ClusterExplorerV1.NodeSource }

export function internalNodeSourceOf(nodeSet: ClusterExplorerV1_2.NodeSource): NodeSourceImpl {
    if ((<any>nodeSet)[BUILT_IN_NODE_SOURCE_KIND_TAG]) {
        return (nodeSet as unknown as BuiltInNodeSource).impl;
    }
    return {
        at(parent: string | undefined) { return internalNodeContributorOf(nodeSet.at(parent)); },
        if(condition: () => boolean | Thenable<boolean>) { return internalNodeSourceOf(nodeSet).if(condition); },
        async nodes() { return (await nodeSet.nodes()).map(internalNodeOf); }
    };
}

export function internalNodeSourceOf1(nodeSet: ClusterExplorerV1.NodeSource): NodeSourceImpl {
    if ((<any>nodeSet)[BUILT_IN_NODE_SOURCE_KIND_TAG]) {
        return (nodeSet as unknown as BuiltInNodeSource).impl;
    }
    return {
        at(parent: string | undefined) { return internalNodeContributorOf(NodeContributor.from11(nodeSet.at(parent))); },
        if(condition: () => boolean | Thenable<boolean>) { return internalNodeSourceOf1(nodeSet).if(condition); },
        async nodes() { return (await nodeSet.nodes()).map(internalNodeOf); }
    };
}

export type NodeConributorVersioned =
    { v: "1"; c: ClusterExplorerV1.NodeContributor } |
    { v: "1.1"; c: ClusterExplorerV1_1.NodeContributor } |
    { v: "1.2"; c: ClusterExplorerV1_2.NodeContributor };

export function internalNodeContributorOf(nodeContributor: ClusterExplorerV1_2.NodeContributor): ExplorerExtender<ClusterExplorerNode> {
    if ((<any>nodeContributor)[BUILT_IN_CONTRIBUTOR_KIND_TAG] === true) {
        return (nodeContributor as unknown as BuiltInNodeContributor).impl;
    }
    return new NodeContributorAdapter(nodeContributor);
}

export function internalNodeContributorOfV(nodeContributor: NodeConributorVersioned): ExplorerExtender<ClusterExplorerNode> {
    if ((<any>nodeContributor.c)[BUILT_IN_CONTRIBUTOR_KIND_TAG] === true) {
        return (nodeContributor as unknown as BuiltInNodeContributor).impl;
    }
    if (nodeContributor.v === "1") {
        return new NodeContributorAdapter2<ClusterExplorerV1.NodeContributor, ClusterExplorerV1.ClusterExplorerNode, ClusterExplorerV1.Node>(nodeContributor.c, (n) => nodeTo11Total(adaptKubernetesExplorerNode(n)));
    } else if (nodeContributor.v === "1.1") {
        return new NodeContributorAdapter2<ClusterExplorerV1_1.NodeContributor, ClusterExplorerV1_1.ClusterExplorerNode, ClusterExplorerV1_1.Node>(nodeContributor.c, (n) => nodeTo11Total(adaptKubernetesExplorerNode(n)));
    } else {
        return new NodeContributorAdapter2<ClusterExplorerV1_2.NodeContributor, ClusterExplorerV1_2.ClusterExplorerNode, ClusterExplorerV1_2.Node>(nodeContributor.c, adaptKubernetesExplorerNode);
    }
}

export function internalNodeOfG<N extends NodeLike>(node: N): ClusterExplorerNode {
    if ((<any>node)[BUILT_IN_NODE_KIND_TAG]) {
        return (node as unknown as BuiltInNode).impl;
    }
    return new ContributedNodeG<N>(node);
}

export function internalNodeOf(node: ClusterExplorerV1_2.Node): ClusterExplorerNode {
    if ((<any>node)[BUILT_IN_NODE_KIND_TAG]) {
        return (node as unknown as BuiltInNode).impl;
    }
    return new ContributedNode(node);
}

function resourceFolderContributor(displayName: string, pluralDisplayName: string, manifestKind: string, abbreviation: string, apiName?: string): ClusterExplorerV1_2.NodeSource {
    const nodeSource = new CustomResourceFolderNodeSource(new ResourceKind(displayName, pluralDisplayName, manifestKind, abbreviation, apiName));
    return apiNodeSourceOf(nodeSource);
}

function groupingFolderContributor(displayName: string, contextValue: string | undefined, ...children: ClusterExplorerV1_2.NodeSource[]): ClusterExplorerV1_2.NodeSource {
    const nodeSource = new CustomGroupingFolderNodeSource(displayName, contextValue, children.map(internalNodeSourceOf));
    return apiNodeSourceOf(nodeSource);
}

function resourceFolderContributor1(displayName: string, pluralDisplayName: string, manifestKind: string, abbreviation: string, apiName?: string): ClusterExplorerV1.NodeSource {
    const nodeSource = new CustomResourceFolderNodeSource(new ResourceKind(displayName, pluralDisplayName, manifestKind, abbreviation, apiName));
    return apiNodeSourceOf1(nodeSource);
}

function groupingFolderContributor1(displayName: string, contextValue: string | undefined, ...children: ClusterExplorerV1.NodeSource[]): ClusterExplorerV1.NodeSource {
    const nodeSource = new CustomGroupingFolderNodeSource(displayName, contextValue, children.map(internalNodeSourceOf1));
    return apiNodeSourceOf1(nodeSource);
}

export namespace NodeContributor {
    export function from11(impl: ClusterExplorerV1.NodeContributor | ClusterExplorerV1_1.NodeContributor): ClusterExplorerV1_2.NodeContributor {
        return {
            contributesChildren: (parent: ClusterExplorerV1_2.ClusterExplorerNode | undefined) =>
                impl.contributesChildren(nodeTo11(parent)),
            getChildren: (parent: ClusterExplorerV1_2.ClusterExplorerNode | undefined): Promise<ClusterExplorerV1_2.Node[]> =>
                impl.getChildren(nodeTo11(parent)),
        };
    }
}

export namespace NodeUICustomizer {
    export function from11(impl: ClusterExplorerV1.NodeUICustomizer | ClusterExplorerV1_1.NodeUICustomizer): ClusterExplorerV1_2.NodeUICustomizer {
        return {
            customize: (node: ClusterExplorerV1_2.ClusterExplorerNode, treeItem: vscode.TreeItem): void | Thenable<void> =>
                impl.customize(nodeTo11Total(node), treeItem)
        };
    }
}
