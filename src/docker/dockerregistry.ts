'use strict';

import * as vscode from 'vscode';

export function tag(imageName: string) : string {
    if (usesLegacyConfig()) {
        return prependConfigValue(imageName, 'vs-docker.imageUser');
    }
    imageName = prependConfigValue(imageName, 'docker.defaultRegistryPath');
    imageName = prependConfigValue(imageName, 'docker.registryPath');
    return imageName;
}

export function isLocal() : boolean {
    return tag('') === '';
}

function prependConfigValue(name: string, configKey: string) : string {
    const configOptions = vscode.workspace.getConfiguration();
    const configValue = configOptions.get(configKey, '');
    if (configValue.length > 0) {
        return `${configValue}/${name}`;
    }
    return name;
}

function usesLegacyConfig() : boolean {
    const configOptions = vscode.workspace.getConfiguration('docker');
    if (configOptions.has('defaultRegistryPath') || configOptions.has('defaultRegistry')) {
        return false;
    }
    return vscode.workspace.getConfiguration('vs-docker').has('imageUser');
}
