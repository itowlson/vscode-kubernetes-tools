import * as clusterproviderregistry from '../../components/clusterprovider/clusterproviderregistry';
import * as api from '../v1.0';

export function asAPI(registry: clusterproviderregistry.ClusterProviderRegistry): api.ClusterProviderRegistry {
    return registry;  // in this case, they are compatible
}