import * as vscode from 'vscode';

import { DiagnosticsV1 } from '../../contract/diagnostics/v1';
import { registerLinter, Linter } from '../../../components/lint/linters';

export function impl(refresh: (document: vscode.TextDocument) => {}): DiagnosticsV1 {
    return new DiagnosticsV1Impl(refresh);
}

class DiagnosticsV1Impl implements DiagnosticsV1 {
    constructor(private readonly refresh: (document: vscode.TextDocument) => {}) {}

    registerDiagnosticsContributor(diagnosticContributor: DiagnosticsV1.DiagnosticsContributor): void {
        const linter = asLinter(diagnosticContributor);
        registerLinter(linter, this.refresh);
    }
}

function asLinter(diagnosticContributor: DiagnosticsV1.DiagnosticsContributor): Linter {
    function name() { return diagnosticContributor.name; }
    async function lint(document: vscode.TextDocument) {
        const diagnostics = await diagnosticContributor.analyse(document);
        if (Array.isArray(diagnostics)) {
            return diagnostics;
        }
        return Array.of(...diagnostics);
    }
    async function codeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext) {
        if (!diagnosticContributor.codeActions) {
            return [];
        }
        return await diagnosticContributor.codeActions(document, range, context);
    }
    return {
        name,
        lint,
        codeActions
    };
}
