// This module is contractual and should not be changed after release.
// It should be in sync with vscode-kubernetes-tools-api/ts/diagnostics/v1.ts
// at all times.

import * as vscode from 'vscode';
import * as kp from 'k8s-manifest-parser';

export interface DiagnosticsV1 {
    registerDiagnosticsContributor(diagnosticContributor: DiagnosticsV1.DiagnosticsContributor): void;
    registerDiagnosticsContributor2(diagnosticContributor: DiagnosticsV1.DiagnosticsContributor2): void;
}

export namespace DiagnosticsV1 {
    export interface DiagnosticsContributor {
        readonly name: string;
        analyse(document: vscode.TextDocument): vscode.Diagnostic[] | IterableIterator<vscode.Diagnostic> | Promise<vscode.Diagnostic[]> | Promise<IterableIterator<vscode.Diagnostic>>;
        codeActions?(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): Promise<(vscode.Command | vscode.CodeAction)[]>;
    }

    export interface DocumentDiagnoser {
        readonly name: string;
        analyseDocument(document: vscode.TextDocument): vscode.Diagnostic[] | IterableIterator<vscode.Diagnostic> | Promise<vscode.Diagnostic[]> | Promise<IterableIterator<vscode.Diagnostic>>;
        codeActions?(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): Promise<(vscode.Command | vscode.CodeAction)[]>;
    }

    export interface ResourceParsesDiagnoser {
        readonly name: string;
        analyseResourceParses(parses: ReadonlyArray<kp.ResourceParse>): EasyMode[] | IterableIterator<EasyMode> | Promise<EasyMode[]> | Promise<IterableIterator<EasyMode>>;
        // TODO: vscode.CodeActionContext may not work well here because it provides a vscode.Diagnostic which has a vscode.Range.  But maybe that's okay as we have a kp.Range as well.
        // TODO: do we need the VS Code TextDocument for URIing etc.?
        codeActions?(parses: ReadonlyArray<kp.ResourceParse>, range: kp.Range, context: vscode.CodeActionContext): Promise<(vscode.Command | vscode.CodeAction)[]>;
    }

    export interface ResourceParseDiagnoser {
        readonly name: string;
        readonly manifestKind?: string;
        analyseResourceParse(parse: kp.ResourceParse): EasyMode[] | IterableIterator<EasyMode> | Promise<EasyMode[]> | Promise<IterableIterator<EasyMode>>;
        codeActions?(parse: kp.ResourceParse, range: kp.Range, context: vscode.CodeActionContext): Promise<(vscode.Command | vscode.CodeAction)[]>;
    }

    export interface ResourceDiagnoser {
        readonly name: string;
        readonly manifestKind?: string;
        analyseResource(resource: kp.MapTraversalEntry): EasyMode[] | IterableIterator<EasyMode> | Promise<EasyMode[]> | Promise<IterableIterator<EasyMode>>;
        codeActions?(parse: kp.ResourceParse, range: kp.Range, context: vscode.CodeActionContext): Promise<(vscode.Command | vscode.CodeAction)[]>;
    }

    export interface ResourceParseEvaluatorDiagnoser {
        readonly name: string;
        readonly manifestKind?: string;
        readonly evaluator: kp.ResourceEvaluator<EasyMode>;
        codeActions?(parse: kp.ResourceParse, range: kp.Range, context: vscode.CodeActionContext): Promise<(vscode.Command | vscode.CodeAction)[]>;
    }

    export type DiagnosticsContributor2 = DocumentDiagnoser | ResourceParsesDiagnoser | ResourceParseDiagnoser | ResourceParseEvaluatorDiagnoser | ResourceDiagnoser;

    export interface EasyMode {
        readonly range: kp.Range;
        readonly message: string;
        readonly severity?: vscode.DiagnosticSeverity;
        readonly code?: string | number;
    }
}
