// This module is contractual and should not be changed after release.
// It should be in sync with vscode-kubernetes-tools-api/ts/diagnostics/v1.ts
// at all times.

import * as vscode from 'vscode';

export interface DiagnosticsV1 {
    registerDiagnosticsContributor(diagnosticContributor: DiagnosticsV1.DiagnosticsContributor): void;
}

export namespace DiagnosticsV1 {
    export interface DiagnosticsContributor {
        readonly name: string;
        analyse(document: vscode.TextDocument, syntax: ResourceEntryMapContent[]): Promise<vscode.Diagnostic[]>;
    }

    export interface ResourceMapEntry {
        readonly keyRange: vscode.Range;
        readonly content: ResourceSyntaxEntryContent;
    }

    export interface ResourceEntryStringContent {
        readonly contentType: 'string';
        readonly value: string;
        readonly range: vscode.Range;
    }

    export interface ResourceEntryNumberContent {
        readonly contentType: 'number';
        readonly value: number;
        readonly range: vscode.Range;
    }

    export interface ResourceEntryBooleanContent {
        readonly contentType: 'boolean';
        readonly value: boolean;
        readonly range: vscode.Range;
    }

    export interface ResourceEntryArrayContent {
        readonly contentType: 'array';
        readonly items: ReadonlyArray<ResourceSyntaxEntryContent>;
    }

    export interface ResourceEntryMapContent {
        readonly contentType: 'map';
        readonly items: { [key: string]: ResourceMapEntry };
    }

    export type ResourceSyntaxEntryContent =
        ResourceEntryStringContent |
        ResourceEntryNumberContent |
        ResourceEntryBooleanContent |
        ResourceEntryArrayContent |
        ResourceEntryMapContent;
}
