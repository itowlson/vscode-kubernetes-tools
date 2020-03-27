import * as vscode from 'vscode';
import * as kp from 'k8s-manifest-parser';

import { DiagnosticsV1 } from '../../contract/diagnostics/v1';
import { registerLinter, Linter } from '../../../components/lint/linters';
import { cantHappen } from '../../../utils/never';
import { flatten } from '../../../utils/array';

export function impl(refresh: (document: vscode.TextDocument) => {}): DiagnosticsV1 {
    return new DiagnosticsV1Impl(refresh);
}

class DiagnosticsV1Impl implements DiagnosticsV1 {
    constructor(private readonly refresh: (document: vscode.TextDocument) => {}) {}

    registerDiagnosticsContributor(diagnosticContributor: DiagnosticsV1.DiagnosticsContributor): void {
        const linter = asLinter(diagnosticContributor);
        registerLinter(linter, this.refresh);
    }

    registerDiagnosticsContributor2(diagnosticContributor: DiagnosticsV1.DiagnosticsContributor2): void {
        const linter = asLinter2(diagnosticContributor);
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

function isDocumentDiagnoser(o: DiagnosticsV1.DiagnosticsContributor2): o is DiagnosticsV1.DocumentDiagnoser {
    return !!((o as DiagnosticsV1.DocumentDiagnoser).analyseDocument);
}

function isResourceParsesDiagnoser(o: DiagnosticsV1.DiagnosticsContributor2): o is DiagnosticsV1.ResourceParsesDiagnoser {
    return !!((o as DiagnosticsV1.ResourceParsesDiagnoser).analyseResourceParses);
}

function isResourceParseDiagnoser(o: DiagnosticsV1.DiagnosticsContributor2): o is DiagnosticsV1.ResourceParseDiagnoser {
    return !!((o as DiagnosticsV1.ResourceParseDiagnoser).analyseResourceParse);
}

function isResourceDiagnoser(o: DiagnosticsV1.DiagnosticsContributor2): o is DiagnosticsV1.ResourceDiagnoser {
    return !!((o as DiagnosticsV1.ResourceDiagnoser).analyseResource);
}

function isResourceParseEvaluatorDiagnoser(o: DiagnosticsV1.DiagnosticsContributor2): o is DiagnosticsV1.ResourceParseEvaluatorDiagnoser {
    return !!((o as DiagnosticsV1.ResourceParseEvaluatorDiagnoser).evaluator);
}

function asLinter2(diagnosticContributor: DiagnosticsV1.DiagnosticsContributor2): Linter {
    function name() { return diagnosticContributor.name; }

    return {
        name,
        lint: makeLintFunction(diagnosticContributor),
        codeActions: async function (_document: vscode.TextDocument, _range: vscode.Range, _context: vscode.CodeActionContext) { return []; }
    };
}

function makeLintFunction(diagnosticContributor: DiagnosticsV1.DiagnosticsContributor2): (document: vscode.TextDocument) => Promise<vscode.Diagnostic[]> {
    if (isDocumentDiagnoser(diagnosticContributor)) {
        return makeDocumentDiagnoserLintFunction(diagnosticContributor);
    }
    if (isResourceParsesDiagnoser(diagnosticContributor)) {
        return makeResourceParsesDiagnoserLintFunction(diagnosticContributor);
    }
    if (isResourceParseDiagnoser(diagnosticContributor)) {
        return makeResourceParseDiagnoserLintFunction(diagnosticContributor);
    }
    if (isResourceDiagnoser(diagnosticContributor)) {
        return makeResourceDiagnoserLintFunction(diagnosticContributor);
    }
    if (isResourceParseEvaluatorDiagnoser(diagnosticContributor)) {
        return makeResourceParseEvaluatorDiagnoserLintFunction(diagnosticContributor);
    }
    return cantHappen(diagnosticContributor);
}

function arrayOf<T>(items: T[] | IterableIterator<T>): T[] {
    if (Array.isArray(items)) {
        return items;
    }
    return Array.of(...items);
}

function makeDocumentDiagnoserLintFunction(diagnosticContributor: DiagnosticsV1.DocumentDiagnoser): (document: vscode.TextDocument) => Promise<vscode.Diagnostic[]> {
    return async function(document: vscode.TextDocument) {
        const diagnostics = await diagnosticContributor.analyseDocument(document);
        return arrayOf(diagnostics);
    };
}

function makeResourceParsesDiagnoserLintFunction(diagnosticContributor: DiagnosticsV1.ResourceParsesDiagnoser): (document: vscode.TextDocument) => Promise<vscode.Diagnostic[]> {
    return async function analyseImpl(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
        function rangeOf(r: kp.Range) {
            return new vscode.Range(document.positionAt(r.start), document.positionAt(r.end));
        }
        const text = document.getText();
        const parses = (document.languageId === 'yaml' ? kp.parseYAML(text) :
                       (document.languageId === 'json' ? kp.parseJSON(text) :
                        []));
        if (parses.length === 0) {
            return [];
        }

        const diags = await diagnosticContributor.analyseResourceParses(parses);
        return arrayOf(diags).map((d) => { const diag = new vscode.Diagnostic(rangeOf(d.range), d.message, d.severity); diag.code = d.code; return diag; });
    };
}

function makeResourceParseDiagnoserLintFunction(diagnosticContributor: DiagnosticsV1.ResourceParseDiagnoser): (document: vscode.TextDocument) => Promise<vscode.Diagnostic[]> {
    return async function analyseImpl(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
        function rangeOf(r: kp.Range) {
            return new vscode.Range(document.positionAt(r.start), document.positionAt(r.end));
        }
        const text = document.getText();
        const parses = (document.languageId === 'yaml' ? kp.parseYAML(text) :
                       (document.languageId === 'json' ? kp.parseJSON(text) :
                        []));

        const resources = diagnosticContributor.manifestKind ? parses.filter((p) => kp.isKind(p, diagnosticContributor.manifestKind!)) : parses;
        if (resources.length === 0) {
            return [];
        }

        const diagPromises = resources.map((r) => diagnosticContributor.analyseResourceParse(r));
        const diagsArray = await Promise.all(diagPromises);
        const diagsArray2 = diagsArray.map((c) => arrayOf(c));
        const diags = flatten(...diagsArray2);
        return diags.map((d) => { const diag = new vscode.Diagnostic(rangeOf(d.range), d.message, d.severity); diag.code = d.code; return diag; });
    };
}

function makeResourceDiagnoserLintFunction(diagnosticContributor: DiagnosticsV1.ResourceDiagnoser): (document: vscode.TextDocument) => Promise<vscode.Diagnostic[]> {
    return async function analyseImpl(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
        function rangeOf(r: kp.Range) {
            return new vscode.Range(document.positionAt(r.start), document.positionAt(r.end));
        }
        const text = document.getText();
        const parses = (document.languageId === 'yaml' ? kp.parseYAML(text) :
                       (document.languageId === 'json' ? kp.parseJSON(text) :
                        [])).map((p) => kp.asTraversable(p));

        const resources = diagnosticContributor.manifestKind ? parses.filter((p) => kp.isKind(p, diagnosticContributor.manifestKind!)) : parses;
        if (resources.length === 0) {
            return [];
        }

        const diagPromises = resources.map((r) => diagnosticContributor.analyseResource(r));
        const diagsArray = await Promise.all(diagPromises);
        const diagsArray2 = diagsArray.map((c) => arrayOf(c));
        const diags = flatten(...diagsArray2);
        return diags.map((d) => { const diag = new vscode.Diagnostic(rangeOf(d.range), d.message, d.severity); diag.code = d.code; return diag; });
    };
}

function makeResourceParseEvaluatorDiagnoserLintFunction(diagnosticContributor: DiagnosticsV1.ResourceParseEvaluatorDiagnoser): (document: vscode.TextDocument) => Promise<vscode.Diagnostic[]> {
    return async function analyseImpl(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
        function rangeOf(r: kp.Range) {
            return new vscode.Range(document.positionAt(r.start), document.positionAt(r.end));
        }
        const text = document.getText();
        const parses = (document.languageId === 'yaml' ? kp.parseYAML(text) :
                       (document.languageId === 'json' ? kp.parseJSON(text) :
                        []));

        const resources = diagnosticContributor.manifestKind ? parses.filter((p) => kp.isKind(p, diagnosticContributor.manifestKind!)) : parses;
        if (resources.length === 0) {
            return [];
        }

        const diags = kp.evaluate(resources, diagnosticContributor.evaluator);
        return diags.map((d) => { const diag = new vscode.Diagnostic(rangeOf(d.range), d.message, d.severity); diag.code = d.code; return diag; });
    };
}
