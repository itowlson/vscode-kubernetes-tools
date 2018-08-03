import * as vscode from 'vscode';
import * as yp from 'yaml-ast-parser';

export class HelmDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[]> {
        return this.provideDocumentSymbolsImpl(document, token);
    }

    async provideDocumentSymbolsImpl(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SymbolInformation[]> {
        const fakeText = document.getText().replace(/{{[^}]*}}/g, (s) => azap(s));  // TODO: expiate sins
        const root = yp.safeLoad(fakeText);
        const syms: vscode.SymbolInformation[] = [];
        walk(root, '', document, document.uri, syms);
        for (const sym of syms) {
            const cc = containmentChain(sym, syms);
            const cctext = cc.map((s) => s.name).reverse().join('.');
            console.log(`[${rfmt(sym)}]  ${symkind(sym)} ${cctext}.${sym.name}`);
        }
        return syms;
    }
}

// TODO: OH LORD THIS IS HORRIBLE SO HORRIBLE
function azap(s: string): string {
    return s.replace(/{{/g, 'AA')
            .replace(/}}/g, 'ZZ')
            .replace(/"/g, 'Q');
}

function rfmt(s: vscode.SymbolInformation): string {
    const r = s.location.range;
    return `${r.start.line}:${r.start.character}-${r.end.line}:${r.end.character}`;
}

function symkind(s: vscode.SymbolInformation): string {
    switch (s.kind) {
        case vscode.SymbolKind.Field: return "[FI]";
        case vscode.SymbolKind.Variable: return "[VA]";
        case vscode.SymbolKind.Object: return "[TX]";
        case vscode.SymbolKind.Constant: return "[CO]";
        default: return "[??]";
    }
}

export function containmentChain(s: vscode.SymbolInformation, sis: vscode.SymbolInformation[]): vscode.SymbolInformation[] {
    const containers = sis.filter((si) => si.kind === vscode.SymbolKind.Field)
                          .filter((si) => si.location.range.contains(s.location.range))
                          .filter((si) => si !== s);
    if (containers.length === 0) {
        return [];
    }
    const nextUp = minimal(containers);
    const fromThere = containmentChain(nextUp, sis);
    return [nextUp, ...fromThere];
}

export function symbolAt(position: vscode.Position, sis: vscode.SymbolInformation[]): vscode.SymbolInformation | undefined {
    const containers = sis.filter((si) => si.location.range.contains(position));
    if (containers.length === 0) {
        return undefined;
    }
    return minimal(containers);
}

function minimal(sis: vscode.SymbolInformation[]): vscode.SymbolInformation {
    let m = sis[0];
    for (const si of sis) {
        if (m.location.range.contains(si.location.range)) {
            m = si;
        }
    }
    return m;
}

function symInfo(node: yp.YAMLNode, containerName: string, d: vscode.TextDocument, uri: vscode.Uri): vscode.SymbolInformation {
    const start = node.startPosition;
    const end = node.endPosition;
    const loc = new vscode.Location(uri, new vscode.Range(d.positionAt(start), d.positionAt(end)));
    switch (node.kind) {
        case yp.Kind.ANCHOR_REF:
            return new vscode.SymbolInformation(`ANCHOR_REF`, vscode.SymbolKind.Variable, containerName, loc);
        case yp.Kind.INCLUDE_REF:
            return new vscode.SymbolInformation(`INCLUDE_REF`, vscode.SymbolKind.Variable, containerName, loc);
        case yp.Kind.MAP:
            const m = node as yp.YamlMap;
            return new vscode.SymbolInformation(`{map}`, vscode.SymbolKind.Variable, containerName, loc);
        case yp.Kind.MAPPING:
            const mp = node as yp.YAMLMapping;
            return new vscode.SymbolInformation(`${mp.key.rawValue}`, vscode.SymbolKind.Field, containerName, loc);
        case yp.Kind.SCALAR:
            const sc = node as yp.YAMLScalar;
            const isTemplateExpr = sc.rawValue.startsWith('AA') && sc.rawValue.endsWith('ZZ');
            return new vscode.SymbolInformation(`"${sc.rawValue}"`, isTemplateExpr ? vscode.SymbolKind.Object : vscode.SymbolKind.Constant, containerName, loc);
        case yp.Kind.SEQ:
            const s = node as yp.YAMLSequence;
            return new vscode.SymbolInformation(`[seq]`, vscode.SymbolKind.Variable, containerName, loc);
    }
    return new vscode.SymbolInformation(`###ARSEBISCUITS###`, vscode.SymbolKind.Variable, containerName, loc);
}

function walk(node: yp.YAMLNode, containerName: string, d: vscode.TextDocument, uri: vscode.Uri, syms: vscode.SymbolInformation[]) {
    // console.log(`WALKIN' ${node.startPosition}-${node.endPosition}: ${node.kind}`);
    const sym = symInfo(node, containerName, d, uri);
    syms.push(sym);
    switch (node.kind) {
        case yp.Kind.ANCHOR_REF:
            return;
        case yp.Kind.INCLUDE_REF:
            return;
        case yp.Kind.MAP:
            const m = node as yp.YamlMap;
            for (const mm of m.mappings) {
                walk(mm, sym.name, d, uri, syms);
            }
            return;
        case yp.Kind.MAPPING:
            const mp = node as yp.YAMLMapping;
            if (mp.value) {
                walk(mp.value, sym.name, d, uri, syms);
            }
            return;
        case yp.Kind.SCALAR:
            return;
        case yp.Kind.SEQ:
            const s = node as yp.YAMLSequence;
            for (const y of s.items) {
                walk(y, sym.name, d, uri, syms);
            }
            return;
    }
}
