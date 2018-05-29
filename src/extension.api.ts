import * as v1 from './api/v1.0';
import * as v2 from './api/v2.0';

export interface RemovedVersion {
    readonly status: 'removed';
}

export interface UnknownVersion {
    readonly status: 'unknown';
}

export interface SupportedVersion {
    readonly status: 'supported';
    readonly api: v1.v1 | v2.v2;
}

export type ExtensionAPIVersion = RemovedVersion | UnknownVersion | SupportedVersion;

export interface ExtensionAPI {
    version(version: string): ExtensionAPIVersion;
}
