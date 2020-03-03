import * as vscode from 'vscode';
import * as kp from 'k8s-manifest-parser';

import { LinterImpl, Syntax } from './linter.impl';
import { warningOn } from './linter.utils';
import { flatten } from '../../utils/array';

// Pod->spec (which can also be found as Deployment->spec.template.spec)
// .containers[each].resources.limits.{cpu,memory}

export class ResourceLimitsLinter implements LinterImpl {
    name(): string {
        return "resource-limits";
    }

    async lint(document: vscode.TextDocument, syntax: Syntax): Promise<vscode.Diagnostic[]> {
        const resources = syntax.parse(document);
        if (!resources) {
            return [];
        }

        const diagnostics = resources.map((r) => this.lintOne(document, r));
        return flatten(...diagnostics);
    }

    private lintOne(document: vscode.TextDocument, resourceParse: kp.ResourceParse): vscode.Diagnostic[] {
        if (!resourceParse) {
            return [];
        }

        const resource = kp.asTraversable(resourceParse);

        // TODO: lib should provide helpers for kinds
        const isPod = resource.string('kind').valid() && resource.string('kind').value() === 'Pod';
        const isDeployment = resource.string('kind').valid() && resource.string('kind').value() === 'Deployment';

        if (!isPod && !isDeployment) {
            return [];
        }

        const podSpec = isPod ? resource.map('spec') : resource.map('spec').map('template').map('spec');
        if (!podSpec.exists() || !podSpec.valid()) {
            return [];
        }

        const containers = podSpec.array('containers');
        if (!containers.exists() || !containers.valid()) {
            return [];
        }

        const warnings: vscode.Diagnostic[] = [];
        const warnOn = (symbol: kp.TraversalEntry, text: string) => {
            warnings.push(warningOn(document, symbol, text));
        };

        for (const container of containers.maps()) {
            if (!container.exists() || !container.valid()) {
                continue;
            }
            const limits = container.map('resources').map('limits');
            if (!limits.child('cpu').exists()) {
                warnOn(limits, 'Container does not specify a CPU limit - this could starve critical processes');
            }
            if (!limits.child('memory').exists()) {
                warnOn(limits, 'Container does not specify a memory limit - this could starve critical processes');
            }
        }

        return warnings;
    }

    async codeActions(_document: vscode.TextDocument, _range: vscode.Range, _context: vscode.CodeActionContext): Promise<(vscode.Command | vscode.CodeAction)[]> {
        return [];
    }
}
