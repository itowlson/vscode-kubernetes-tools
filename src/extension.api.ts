export interface RemovedVersion {
    readonly status: 'removed';
}

export interface UnknownVersion {
    readonly status: 'unknown';
}

export interface SupportedVersion {
    readonly status: 'supported';
    readonly api: any;
}

export type ExtensionAPIVersion = RemovedVersion | UnknownVersion | SupportedVersion;

export interface ExtensionAPI {
    version(version: string): ExtensionAPIVersion;
}
