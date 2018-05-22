export interface v1 {
    readonly clusterProviderRegistry: ClusterProviderRegistry;  // TODO: wrap this in API layer
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
