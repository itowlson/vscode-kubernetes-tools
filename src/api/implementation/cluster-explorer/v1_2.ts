/* eslint-disable camelcase */

import { KubernetesExplorer, KUBERNETES_EXPLORER_NODE_CATEGORY } from "../../../components/clusterexplorer/explorer";
import { ClusterExplorerNode } from "../../../components/clusterexplorer/node";
import { ClusterExplorerV1_2 } from '../../contract/cluster-explorer/v1_2';

import { adaptKubernetesExplorerNode, adaptToExplorerUICustomizer, internalNodeContributorOf, resourceFolderContributor, groupingFolderContributor } from './common';

export function impl(explorer: KubernetesExplorer): ClusterExplorerV1_2 {
    return new ClusterExplorerV1_2Impl(explorer);
}

class ClusterExplorerV1_2Impl implements ClusterExplorerV1_2 {
    constructor(private readonly explorer: KubernetesExplorer) {}

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
        return {
            resourceFolder: resourceFolderContributor,
            groupingFolder: groupingFolderContributor
        };
    }

    refresh(): void {
        this.explorer.refresh();
    }
}
