import { Kubectl } from '../../kubectl';
import { Host } from '../../host';
import * as kuberesources from '../../kuberesources';
import { failed } from '../../errorable';
import { ClusterExplorerNode, ClusterExplorerResourceFolderNode } from './node';
import { MessageNode } from './node.message';
import { FolderNode } from './node.folder';
import { ResourceNode } from './node.resource';
import { ResourceKindUIDescriptor, kindUIDescriptor } from './resourceui';

export class ResourceFolderNode extends FolderNode implements ClusterExplorerResourceFolderNode {

    static create(kind: kuberesources.ResourceKind, uiDescriptor?: ResourceKindUIDescriptor): ResourceFolderNode {
        const actualUIDescriptor = uiDescriptor || kindUIDescriptor(kind);
        return new ResourceFolderNode(kind, actualUIDescriptor);
    }

    constructor(readonly kind: kuberesources.ResourceKind, private readonly uiDescriptor: ResourceKindUIDescriptor) {
        super("folder.resource", kind.abbreviation, kind.pluralDisplayName, "vsKubernetes.kind");
    }
    readonly nodeType = 'folder.resource';
    async getChildren(kubectl: Kubectl, host: Host): Promise<ClusterExplorerNode[]> {
        const lister = this.uiDescriptor.lister;
        if (lister) {
            return await lister.list(kubectl, this.kind);
        }
        const childrenLines = await kubectl.asLines(`get ${this.kind.abbreviation}`);
        if (failed(childrenLines)) {
            host.showErrorMessage(childrenLines.error[0]);
            return [new MessageNode("Error")];
        }
        return childrenLines.result.map((line) => {
            const bits = line.split(' ');
            return ResourceNode.create(this.kind, bits[0], undefined, undefined);
        });
    }
}
