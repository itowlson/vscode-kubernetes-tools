import * as vscode from 'vscode';

export interface v2 {
    readonly clusterProviderRegistry: ClusterProviderRegistry;
    readonly explorerNodeProviderRegistry: ExplorerNodeProviderRegistry;
}

export type ClusterProviderAction = 'create' | 'configure';

export interface ClusterProvider {
    readonly id: string;
    readonly displayName: string;
    readonly port: number;
    readonly supportedActions: ClusterProviderAction[];
}

export interface ClusterProviderRegistry {
    register(clusterProvider: ClusterProvider): void;
}

export interface ExplorerNodeProviderRegistry {
    contributeChildren(parent: ExplorerParent): Promise<KubernetesExplorerObject[]>;
}

export interface ExplorerRoot {
    readonly nodeType: 'root';
}

export interface ExplorerWellKnownFolder {
    readonly nodeType: 'wellKnownFolder';
    readonly id: 'Nodes' | 'Services' | 'Namespaces' | 'Workloads' | 'Configuration' | 'Pods' | 'Deployments' | 'Jobs';
}

export interface ExplorerKubernetesResource {
    readonly nodeType: 'resource';
    readonly id: string;  // TODO: how to make this contractual?
}

export type ExplorerParent = ExplorerRoot | ExplorerWellKnownFolder | ExplorerKubernetesResource;

export interface KubernetesExplorerObject {
    readonly id: string;
    readonly metadata?: any;
    getChildren(kubectl: Kubectl): vscode.ProviderResult<KubernetesExplorerObject>;
    getTreeItem(): vscode.TreeItem | Thenable<vscode.TreeItem>;
}

export interface ShellResult {
    code: number;
    stdout: string;
    stderr: string;
}

export interface Kubectl {
    invoke(args: string): Promise<ShellResult>;
}