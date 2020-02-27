import * as v1 from "./v1";
import { API } from "../../contract/api";
import { versionUnknown, available } from "../apiutils";

import * as vscode from 'vscode';

export function apiVersion(version: string, refresh: (document: vscode.TextDocument) => {}): API<any> {
    switch (version) {
        case "v1": return available(v1.impl(refresh));
        default: return versionUnknown;
    }
}
