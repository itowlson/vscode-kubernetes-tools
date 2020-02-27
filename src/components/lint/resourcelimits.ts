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
        const warnOn = (symbol: kp.Keyed, text: string) => {
            warnings.push(warningOn(document, symbol, text));
        };

        for (let index = 0; index < containers.items().length; ++index) {
            const container = containers.map(index);
            if (!container.exists() || !container.valid()) {
                continue;
            }
            const resources = container.map('resources');
            if (!resources.exists() || !resources.valid()) {
                // TODO: we should be able to give a range for the container node dammit
                warnOn(containers, 'One or more containers does not have resource limits - this could starve critical processes');
                continue;
            }
            const limits = resources.map('limits');
            if (!limits.exists() || !limits.valid()) {
                warnOn(resources, 'Container does not have resource limits - this could starve critical processes');
                continue;
            }
            const cpuLimit = limits.child('cpu');
            if (!cpuLimit.exists()) {
                warnOn(limits, 'Container does not specify a CPU limit - this could starve critical processes');
            }
            const memoryLimit = limits.child('memory');
            if (!memoryLimit.exists()) {
                warnOn(limits, 'Container does not specify a memory limit - this could starve critical processes');
            }
        }

        return warnings;
    }
}
