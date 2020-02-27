import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import * as kp from 'k8s-manifest-parser';

import { Linter } from './linters';

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
}
