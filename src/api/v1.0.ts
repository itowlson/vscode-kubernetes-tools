import * as clusterproviderregistry from '../components/clusterprovider/clusterproviderregistry';

export interface v1 {
    readonly clusterProviderRegistry: clusterproviderregistry.ClusterProviderRegistry;  // TODO: wrap this in API layer
}
