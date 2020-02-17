import * as vscode from 'vscode';

import { JsonALikeYamlDocumentSymbolProvider } from '../../yaml-support/jsonalike-symbol-provider';
import { JsonHierarchicalDocumentSymbolProvider } from '../json/jsonhierarchicalsymbolprovider';

export interface ResourceMapEntry {
    readonly keyRange: vscode.Range;
    readonly content: ResourceSyntaxEntryContent;
}

export interface ResourceEntryStringContent {
    readonly contentType: 'string';
    readonly value: string;
    readonly range: vscode.Range;
}

export interface ResourceEntryNumberContent {
    readonly contentType: 'number';
    readonly value: number;
    readonly range: vscode.Range;
}

export interface ResourceEntryBooleanContent {
    readonly contentType: 'boolean';
    readonly value: boolean;
    readonly range: vscode.Range;
}

export interface ResourceEntryArrayContent {
    readonly contentType: 'array';
    readonly items: ReadonlyArray<ResourceSyntaxEntryContent>;
}

export interface ResourceEntryMapContent {
    readonly contentType: 'map';
    readonly items: { [key: string]: ResourceMapEntry };
}

export type ResourceSyntaxEntryContent =
    ResourceEntryStringContent |
    ResourceEntryNumberContent |
    ResourceEntryBooleanContent |
    ResourceEntryArrayContent |
    ResourceEntryMapContent;

const jsonalikeYamlSymboliser = new JsonALikeYamlDocumentSymbolProvider();
const jsonSymboliser = new JsonHierarchicalDocumentSymbolProvider();

export async function parseJSON(document: vscode.TextDocument): Promise<ResourceEntryMapContent[]> {
    const symbols = await jsonSymboliser.provideDocumentSymbols(document, new vscode.CancellationTokenSource().token);
    return toSyntaxTree(symbols);
}

export async function parseYAML(document: vscode.TextDocument): Promise<ResourceEntryMapContent[]> {
    const symbols = await jsonalikeYamlSymboliser.provideDocumentSymbols(document, new vscode.CancellationTokenSource().token);
    return toSyntaxTree(symbols);
}

function toSyntaxTree(symbols: vscode.SymbolInformation[] | null | undefined): ResourceEntryMapContent[] {
    if (!symbols) {
        return [];
    }

    for (const s of symbols) {
        console.log(s);
    }

    return [];
}
