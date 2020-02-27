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
        analyse(document: vscode.TextDocument): vscode.Diagnostic[] | IterableIterator<vscode.Diagnostic> | Promise<vscode.Diagnostic[]> | Promise<IterableIterator<vscode.Diagnostic>>;
        codeActions?(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): Promise<(vscode.Command | vscode.CodeAction)[]>;
    }
}
