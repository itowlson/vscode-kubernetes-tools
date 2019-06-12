import * as vscode from 'vscode';

import * as kuberesources from '../../kuberesources';
import { ClusterExplorerNode } from './node';
import { ResourceNode } from './node.resource';
import { namespaceUICustomiser, namespaceLister } from './resourcekinds/resourcekind.namespace';
import { podUICustomiser, podStatusChildSource, podLister } from './resourcekinds/resourcekind.pod';
import { Kubectl } from '../../kubectl';
import { selectedPodsChildSource, hasSelectorLister } from './resourcekinds/resourcekinds.selectspods';
import { nodePodsChildSource } from './resourcekinds/resourcekind.node';
import { configItemsChildSource, configResourceLister } from './resourcekinds/resourcekinds.configuration';

const specialKinds: ReadonlyArray<ResourceKindUIDescriptor> = [
    { kind: kuberesources.allKinds.namespace, lister: namespaceLister, uiCustomiser: namespaceUICustomiser },
    { kind: kuberesources.allKinds.node, childSources: [nodePodsChildSource] },
    { kind: kuberesources.allKinds.deployment, lister: hasSelectorLister, childSources: [selectedPodsChildSource] },
    { kind: kuberesources.allKinds.daemonSet, lister: hasSelectorLister, childSources: [selectedPodsChildSource] },
    { kind: kuberesources.allKinds.pod, lister: podLister, childSources: [podStatusChildSource], uiCustomiser: podUICustomiser },
    { kind: kuberesources.allKinds.service, lister: hasSelectorLister, childSources: [selectedPodsChildSource] },
    { kind: kuberesources.allKinds.configMap, lister: configResourceLister, childSources: [configItemsChildSource] },
    { kind: kuberesources.allKinds.secret, lister: configResourceLister, childSources: [configItemsChildSource] },
    { kind: kuberesources.allKinds.statefulSet, lister: hasSelectorLister, childSources: [selectedPodsChildSource] },
];

function defaultUIDescriptor(kind: kuberesources.ResourceKind): ResourceKindUIDescriptor {
    return {
        kind: kind
    };
}

export function kindUIDescriptor(kind: kuberesources.ResourceKind): ResourceKindUIDescriptor {
    const descriptor = specialKinds.find((d) => d.kind.manifestKind === kind.manifestKind);
    if (descriptor) {
        return descriptor;
    }
    return defaultUIDescriptor(kind);
}

export function getChildSources(descriptor: ResourceKindUIDescriptor): ReadonlyArray<ResourceChildSource> {
    return descriptor.childSources || [];
}

export function getUICustomiser(descriptor: ResourceKindUIDescriptor): ResourceUICustomiser {
    return descriptor.uiCustomiser || NO_CUSTOMISER;
}

const NO_CUSTOMISER = {
    customiseTreeItem(_resource: ResourceNode, _treeItem: vscode.TreeItem): void {}
};

export interface ResourceKindUIDescriptor {
    readonly kind: kuberesources.ResourceKind;
    readonly lister?: ResourceLister;
    readonly childSources?: ReadonlyArray<ResourceChildSource>;
    readonly uiCustomiser?: ResourceUICustomiser;
}

export interface ResourceLister {
    list(kubectl: Kubectl, kind: kuberesources.ResourceKind): Promise<ClusterExplorerNode[]>;
}

export interface ResourceUICustomiser {
    customiseTreeItem(resource: ResourceNode, treeItem: vscode.TreeItem): void;
}

export interface ResourceChildSource {
    children(kubectl: Kubectl, parent: ResourceNode): Promise<ClusterExplorerNode[]>;
}
