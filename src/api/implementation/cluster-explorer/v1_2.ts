/* eslint-disable camelcase */

import { KubernetesExplorer, KUBERNETES_EXPLORER_NODE_CATEGORY } from "../../../components/clusterexplorer/explorer";
import { ClusterExplorerNode } from "../../../components/clusterexplorer/node";
import { ClusterExplorerV1_2 } from '../../contract/cluster-explorer/v1_2';

import { adaptKubernetesExplorerNode, adaptToExplorerUICustomizer, internalNodeContributorOf, resourceFolderContributor, groupingFolderContributor, dynamicGroupingFolderContributor } from './common';

export function impl(explorer: KubernetesExplorer): ClusterExplorerV1_2 {
    return new ClusterExplorerV1_2Impl(explorer);
}

class ClusterExplorerV1_2Impl implements ClusterExplorerV1_2 {
    constructor(private readonly explorer: KubernetesExplorer) {}
    private readonly nodeSourcesImpl = new NodeSources();

    resolveCommandTarget(target?: any): ClusterExplorerV1_2.ClusterExplorerNode | undefined {
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

    registerNodeContributor(nodeContributor: ClusterExplorerV1_2.NodeContributor): void {
        const adapted = internalNodeContributorOf(nodeContributor);
        this.explorer.registerExtender(adapted);
    }

    registerNodeUICustomizer(nodeUICustomizer: ClusterExplorerV1_2.NodeUICustomizer): void {
        const adapted = adaptToExplorerUICustomizer(nodeUICustomizer);
        this.explorer.registerUICustomiser(adapted);
    }

    get nodeSources(): ClusterExplorerV1_2.NodeSources {
        return this.nodeSourcesImpl;
    }

    refresh(): void {
        this.explorer.refresh();
    }
}

class NodeSources implements ClusterExplorerV1_2.NodeSources {
    resourceFolder(displayName: string, pluralDisplayName: string, manifestKind: string, abbreviation: string, apiName?: string): ClusterExplorerV1_2.NodeSource {
        return resourceFolderContributor(displayName, pluralDisplayName, manifestKind, abbreviation, apiName);
    }
    groupingFolder(displayName: string, contextValue: string | undefined, ...children: ClusterExplorerV1_2.NodeSource[]): ClusterExplorerV1_2.NodeSource;
    groupingFolder(displayName: string, contextValue: string | undefined, children: () => Promise<ClusterExplorerV1_2.NodeSource[]>): ClusterExplorerV1_2.NodeSource;
    groupingFolder(displayName: any, contextValue: any, children?: any) {
        if (typeof children === 'function') {
            return dynamicGroupingFolderContributor(displayName, contextValue, children);
        }
        return groupingFolderContributor(displayName, contextValue, children);
    }

}
