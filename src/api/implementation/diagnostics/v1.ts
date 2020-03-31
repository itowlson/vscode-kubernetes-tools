import * as vscode from 'vscode';
import * as kp from 'k8s-manifest-parser';

import { DiagnosticsV1 } from '../../contract/diagnostics/v1';
import { registerLinter, Linter } from '../../../components/lint/linters';
import { cantHappen } from '../../../utils/never';
import { flatten } from '../../../utils/array';
import * as lintedit from '../../../components/lint/edit';

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

interface KindableDiagnostic {
    readonly diagnosticKind: string;
}

class EasyModeDiagnostic extends vscode.Diagnostic implements KindableDiagnostic {
    readonly diagnosticKind = 'k8s-easy-mode';
    constructor(range: vscode.Range, message: string, severity: vscode.DiagnosticSeverity | undefined, code: string | number | undefined, readonly metadata: any) {
        super(range, message, severity);
        this.code = code;
    }
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
        codeActions: makeCodeActionsFunction(diagnosticContributor) || (async (_d, _r, _c) => Array.of<vscode.Command | vscode.CodeAction>())
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

type CodeActionsFunction = ((document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext) => Promise<(vscode.Command | vscode.CodeAction)[]>) | undefined;

function makeCodeActionsFunction(diagnosticContributor: DiagnosticsV1.DiagnosticsContributor2): CodeActionsFunction {
    if (isDocumentDiagnoser(diagnosticContributor)) {
        return diagnosticContributor.codeActions;
    }
    return makeEasyModeDiagnoserCodeActionsFunction(diagnosticContributor.codeActions);
}

function arrayOf<T>(items: T[] | IterableIterator<T>): T[] {
    if (Array.isArray(items)) {
        return items;
    }
    return Array.of(...items);
}

function isNativeAction(ema: DiagnosticsV1.EasyModeAction): ema is vscode.CodeAction {
    return !!((ema as any).edit) || !!((ema as any).command);
}

function codeActionOf(ema: DiagnosticsV1.EasyModeAction, document: vscode.TextDocument, parsedDocument: kp.ResourceParse[]): vscode.CodeAction {
    if (isNativeAction(ema)) {
        return ema;
    }
    const edit = new vscode.WorkspaceEdit();
    for (const e of ema.edits) {
        switch (e.kind) {
            case 'insert':
                edit.insert(document.uri, document.positionAt(e.at), e.text);
                break;
            case 'merge':
                lintedit.merge(edit, document, parsedDocument, e.into, e.value);
                break;
            default:
                cantHappen(e);
                break;
            // case 'insert-map-entry':
            //     lintedit.appendMapEntries(edit, document, e.under, e.mapEntry);
            //     // const map = e.under;
            //     // const mapRange = new vscode.Range(document.positionAt(map.range.start), document.positionAt(map.range.end));
            //     // edit.replace(document.uri, range, newText);
            //     break;
        }
    }
    const a = new vscode.CodeAction(ema.title, vscode.CodeActionKind.QuickFix);
    a.edit = edit;
    return a;
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
        return arrayOf(diags).map((d) => new EasyModeDiagnostic(rangeOf(d.range), d.message, d.severity, d.code, d.metadata));
    };
}

function makeEasyModeDiagnoserCodeActionsFunction(impl: ((parses: ReadonlyArray<kp.ResourceParse>, range: kp.Range, diagnostics: DiagnosticsV1.EasyMode[]) => Promise<DiagnosticsV1.EasyModeAction[]>) | undefined): CodeActionsFunction {
    if (!impl) {
        return undefined;
    }

    return async function(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): Promise<(vscode.Command | vscode.CodeAction)[]> {
        function unrangeOf(r: vscode.Range): kp.Range {
            return { start: document.offsetAt(r.start), end: document.offsetAt(r.end) };
        }

        // TODO: could cache in a diagnostic?
        const text = document.getText();
        const parses = (document.languageId === 'yaml' ? kp.parseYAML(text) :
                       (document.languageId === 'json' ? kp.parseJSON(text) :
                        []));
        if (parses.length === 0) {
            return [];
        }

        const emdiags = context.diagnostics
                               .filter((d) => (d as unknown as KindableDiagnostic).diagnosticKind === 'k8s-easy-mode')
                               .map((d) => ({ range: unrangeOf(d.range), message: d.message, severity: d.severity, code: d.code, metadata: (d as EasyModeDiagnostic).metadata }));

        const emas = await impl(parses, unrangeOf(range), emdiags);

        return emas.map((ema) => codeActionOf(ema, document, parses));
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
        return diags.map((d) => new EasyModeDiagnostic(rangeOf(d.range), d.message, d.severity, d.code, d.metadata));
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
        return diags.map((d) => new EasyModeDiagnostic(rangeOf(d.range), d.message, d.severity, d.code, d.metadata));
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
        return diags.map((d) => new EasyModeDiagnostic(rangeOf(d.range), d.message, d.severity, d.code, d.metadata));
    };
}
