import * as vscode from 'vscode';
import * as kp from 'k8s-manifest-parser';

export function warningOn(document: vscode.TextDocument, symbol: kp.Keyed, text: string): vscode.Diagnostic {
    const range = toDocumentRange(document, symbol.keyRange());
    return new vscode.Diagnostic(range, text, vscode.DiagnosticSeverity.Warning);
}

function toDocumentRange(document: vscode.TextDocument, range: kp.Range): vscode.Range {
    return new vscode.Range(document.positionAt(range.start), document.positionAt(range.end));
}
