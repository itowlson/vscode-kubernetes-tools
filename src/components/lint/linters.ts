import * as vscode from 'vscode';

import { expose, LintersCodeActionProvider } from './linter.impl';
import { ResourceLimitsLinter } from './resourcelimits';

export interface Linter {
    name(): string;
    lint(document: vscode.TextDocument): Promise<vscode.Diagnostic[]>;
    codeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): Promise<(vscode.Command | vscode.CodeAction)[]>;
}

export function isLintable(document: vscode.TextDocument): boolean {
    return document.languageId === 'yaml' || document.languageId === 'json' || document.languageId === 'helm';
}

export function isLinterDisabled(disabledLinters: string[], name: string): boolean {
    return (disabledLinters || []).includes(name);
}

export const linters: Linter[] = [
    new ResourceLimitsLinter()
].map(expose);

const codeActionProvider = new LintersCodeActionProvider(linters);

export function lintersCodeActionProvider(): vscode.CodeActionProvider {
    return codeActionProvider;
}

export function registerLinter(linter: Linter, refresh: (document: vscode.TextDocument) => {}): void {
    linters.push(linter);
    vscode.workspace.textDocuments.forEach(refresh);
}
