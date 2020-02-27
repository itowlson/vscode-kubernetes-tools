import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import * as kp from 'k8s-manifest-parser';

import * as config from '../config/config';
import { Linter, isLintable, isLinterDisabled } from './linters';

export function expose(impl: LinterImpl): Linter {
    return new StandardLinter(impl);
}

export interface Syntax {
    load(text: string): any[];
    parse(document: vscode.TextDocument): kp.ResourceParse[];
}

class StandardLinter implements Linter {
    constructor(private readonly impl: LinterImpl) {}

    name(): string {
        return this.impl.name();
    }

    async lint(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
        try {
            switch (document.languageId) {
                case 'json':
                    return await this.impl.lint(document, jsonSyntax);
                case 'yaml':
                    return await this.impl.lint(document, yamlSyntax);
                default:
                    // TODO: do we need to do Helm?
                    return [];
            }
        } catch {
            return [];
        }
    }

    async codeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): Promise<(vscode.Command | vscode.CodeAction)[]> {
        try {
            switch (document.languageId) {
                case 'json':
                    return await this.impl.codeActions(document, range, context, jsonSyntax);
                case 'yaml':
                    return await this.impl.codeActions(document, range, context, yamlSyntax);
                default:
                    // TODO: do we need to do Helm?
                    return [];
            }
        } catch {
            return [];
        }
    }
}

const jsonSyntax: Syntax = {
    load(text: string) { return [JSON.parse(text)]; },
    parse(document: vscode.TextDocument) { return kp.parseJSON(document.getText()); }
};

const yamlSyntax: Syntax = {
    load(text: string) { return yaml.safeLoadAll(text); },
    parse(document: vscode.TextDocument) { return kp.parseYAML(document.getText()); }
};

export interface LinterImpl {
    name(): string;
    lint(document: vscode.TextDocument, syntax: Syntax): Promise<vscode.Diagnostic[]>;
    codeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, syntax: Syntax): Promise<(vscode.Command | vscode.CodeAction)[]>;
}

export class LintersCodeActionProvider implements vscode.CodeActionProvider {
    constructor(private readonly linters: Linter[]) {}

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, _token: vscode.CancellationToken): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
        return this.provideCodeActionsImpl(document, range, context);
    }

    private async provideCodeActionsImpl(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext): Promise<(vscode.Command | vscode.CodeAction)[]> {
        if (config.getDisableLint()) {
            return [];
        }
        // Is it a Kubernetes document?
        if (!isLintable(document)) {
            return [];
        }
        const disabledLinters = config.getDisabledLinters();
        const linterPromises =
            this.linters
                .filter((l) => !isLinterDisabled(disabledLinters, l.name()))
                .map((l) => l.codeActions(document, range, context));
        const linterResults = await Promise.all(linterPromises);
        const fixes = ([] as (vscode.Command | vscode.CodeAction)[]).concat(...linterResults);

        return fixes;
    }
}
