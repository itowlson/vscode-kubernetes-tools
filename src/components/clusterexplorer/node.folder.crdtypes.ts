import { Kubectl } from '../../kubectl';
import * as kubectlUtils from '../../kubectlUtils';
import { Host } from '../../host';
import * as kuberesources from '../../kuberesources';
import { CRD } from '../../kuberesources.objectmodel';
import { ClusterExplorerNode } from './node';
import { ResourceFolderNode } from './node.folder.resource';
import { GroupingFolderNode } from './node.folder.grouping';

export class CRDTypesFolderNode extends GroupingFolderNode {
    constructor() {
        super("folder.grouping", kuberesources.allKinds.crd.abbreviation, kuberesources.allKinds.crd.pluralDisplayName);
    }
    async getChildren(kubectl: Kubectl, _host: Host): Promise<ClusterExplorerNode[]> {
        const objects = await kubectlUtils.getCRDTypes(kubectl);
        return objects.map((obj) => new ResourceFolderNode(this.customResourceKind(obj)));
    }
    private customResourceKind(crd: CRD): kuberesources.ResourceKind {
        return new kuberesources.ResourceKind(crd.spec.names.singular, crd.spec.names.plural, crd.spec.names.kind, this.safeAbbreviation(crd));
    }
    private safeAbbreviation(crd: CRD): string {
        const shortNames = crd.spec.names.shortNames;
        return (shortNames && shortNames.length > 0) ? shortNames[0] : crd.metadata.name;
    }
}