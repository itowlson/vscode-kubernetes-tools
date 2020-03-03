import * as vscode from 'vscode';
import * as kp from 'k8s-manifest-parser';

export function warningOn(document: vscode.TextDocument, symbol: kp.TraversalEntry, text: string): vscode.Diagnostic {
    const range = toDocumentRange(document, kp.highlightRange(symbol));
    return new vscode.Diagnostic(range, text, vscode.DiagnosticSeverity.Warning);
}

function toDocumentRange(document: vscode.TextDocument, range: kp.Range): vscode.Range {
    return new vscode.Range(document.positionAt(range.start), document.positionAt(range.end));
}
