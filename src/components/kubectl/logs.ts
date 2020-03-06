import * as vscode from 'vscode';
import { Kubectl, InvokeReason } from '../../kubectl';
import { PodSummary, quickPickKindName, selectContainerForResource } from '../../extension';
import { isPod } from '../../kuberesources.objectmodel';
import * as kuberesources from '../../kuberesources';
import * as yaml from 'js-yaml';
import * as kubectlUtils from '../../kubectlUtils';
import { LogsPanel } from '../../components/logs/logsWebview';
import { ContainerContainer } from '../../utils/containercontainer';
import { ChildProcess } from 'child_process';
import { ClusterExplorerResourceNode } from '../clusterexplorer/node';
import { logsDisplay, LogsDisplay } from '../config/config';

export enum LogsDisplayMode {
    Show,
    Follow
}

/**
 * Fetches logs for a Pod. Handles use cases for fetching pods
 * from an open document, or from the current namespace.
 */
export async function logsKubernetes(
    kubectl: Kubectl,
    explorerNode: ClusterExplorerResourceNode | undefined,
    displayMode: LogsDisplayMode
) {
    if (explorerNode) {
        return await getLogsForExplorerNode(kubectl, InvokeReason.UserCommand, explorerNode, displayMode);
    }

    return logsForPod(kubectl, InvokeReason.UserCommand, displayMode);
}

/**
 * Fetch logs from a Pod, when selected from the Explorer.
 */
async function getLogsForExplorerNode(
    kubectl: Kubectl,
    reason: InvokeReason,
    explorerNode: ClusterExplorerResourceNode,
    displayMode: LogsDisplayMode
) {
    const resource = ContainerContainer.fromNode(explorerNode);
    if (!resource) {
        return;
    }

    return await getLogsForResource(kubectl, reason, resource, displayMode);
}

/**
 * Fetches logs for a pod. If there are more than one containers,
 * prompts the user for which container to fetch logs for.
 */
async function getLogsForPod(kubectl: Kubectl, reason: InvokeReason, pod: PodSummary, displayMode: LogsDisplayMode) {
    const resource = {
        kindName: `pod/${pod.name}`,
        namespace: pod.namespace,
        containers: pod.spec ? pod.spec.containers : undefined,
        containersQueryPath: '.spec'
    };
    return getLogsForResource(kubectl, reason, resource, displayMode);
}

async function getLogsForResource(kubectl: Kubectl, reason: InvokeReason, resource: ContainerContainer, displayMode: LogsDisplayMode) {
    if (!resource) {
        vscode.window.showErrorMessage('Can\'t find the resource to get logs from!');
        return;
    }

    const container = await selectContainerForResource(resource);
    if (!container) {
        return;
    }

    await getLogsForContainer(kubectl, reason, resource, container.name, displayMode);
}

/**
 * Gets the logs for a container in a provided pod, in a provided namespace, in a provided container.
 */
async function getLogsForContainer(
    kubectl: Kubectl,
    reason: InvokeReason,
    containerResource: ContainerContainer,
    containerName: string | undefined,
    displayMode: LogsDisplayMode
) {
    let cmd = `logs ${containerResource.kindName}`;

    if (containerResource.namespace) {
        cmd = `${cmd} --namespace=${containerResource.namespace}`;
    }

    if (containerName) {
        cmd = `${cmd} --container=${containerName}`;
    }

    if (displayMode === LogsDisplayMode.Follow) {
        cmd = `${cmd} -f`;
    }

    if (logsDisplay() === LogsDisplay.Terminal) {
        if (displayMode === LogsDisplayMode.Follow) {
            const title = `Logs: ${containerResource.kindName}${containerName ? ('/' + containerName) : ''}`;
            kubectl.invokeInNewTerminal(reason, cmd, title);
        } else {
            kubectl.invokeInSharedTerminal(reason, cmd);
        }
        return;
    }

    const resource = `${containerResource.namespace}/${containerResource.kindName}`;
    const panel = LogsPanel.createOrShow('Loading...', resource);

    if (displayMode === LogsDisplayMode.Follow) {
        cmd = `${cmd} -f`;
        kubectl.invokeAsync(reason, cmd, undefined, (proc: ChildProcess) => {
            proc.stdout.on('data', (data: string) => {
                panel.addContent(data);
            });
        });
        return;
    }

    try {
        const result = await kubectl.invokeAsync(reason, cmd);
        if (!result || result.code !== 0) {
            vscode.window.showErrorMessage(`Error reading logs: ${result ? result.stderr : undefined}`);
        } else {
            panel.setInfo(result.stdout, containerResource.kindName);
        }
    } catch (err) {
        vscode.window.showErrorMessage(`Error reading logs ${err}`);
    }
}

/**
 * Searches for a pod yaml spec from the open document
 * or from the currently selected namespace.
 */
async function logsForPod(kubectl: Kubectl, reason: InvokeReason, displayMode: LogsDisplayMode): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (editor) {
        return await logsForPodFromOpenDocument(kubectl, reason, editor, displayMode);
    }

    return await logsForPodFromCurrentNamespace(kubectl, reason, displayMode);
}

/**
 * Finds a Pod from the open editor.
 */
async function logsForPodFromOpenDocument(kubectl: Kubectl, reason: InvokeReason, editor: vscode.TextEditor, displayMode: LogsDisplayMode) {
    const text = editor.document.getText();
    try {
        const obj: {} = yaml.safeLoad(text);
        if (isPod(obj)) {
            // document describes a pod.
            const podSummary = {
                name: obj.metadata.name,
                namespace: obj.metadata.namespace
            };

            return await getLogsForPod(kubectl, reason, podSummary, displayMode);
        }
    } catch (ex) {
        // pass
    }

    return await logsForPodFromCurrentNamespace(kubectl, reason, displayMode);
}

/**
 * Alerts the user on pods available in the current namespace.
 */
async function logsForPodFromCurrentNamespace(kubectl: Kubectl, reason: InvokeReason, displayMode: LogsDisplayMode) {
    const namespace = await kubectlUtils.currentNamespace(kubectl);

    quickPickKindName(
        [kuberesources.allKinds.pod],
        { nameOptional: false },
        async (pod) => {

            const podSummary: PodSummary = {
                name: pod.split('/')[1],
                namespace: namespace // should figure out how to handle namespaces.
            };

            await getLogsForPod(kubectl, reason, podSummary, displayMode);
        }
    );
}
