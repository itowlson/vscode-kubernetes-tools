/* eslint-disable camelcase */

import { KubernetesExplorer } from "../../../components/clusterexplorer/explorer";
import { ClusterExplorerV1_2 } from '../../contract/cluster-explorer/v1_2';

import {
    resolveCommandTarget,
    adaptToExplorerUICustomizer,
    internalNodeContributorOf,
    allNodeSources
} from './common';

export function impl(explorer: KubernetesExplorer): ClusterExplorerV1_2 {
    return new ClusterExplorerV1_2Impl(explorer);
}

class ClusterExplorerV1_2Impl implements ClusterExplorerV1_2 {
    constructor(private readonly explorer: KubernetesExplorer) {}

    resolveCommandTarget(target?: any): ClusterExplorerV1_2.ClusterExplorerNode | undefined {
       return resolveCommandTarget(target);
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
        return allNodeSources();
    }

    refresh(): void {
        this.explorer.refresh();
    }
}
