import { Uri, FileSystemProvider, FileType, FileStat, FileChangeEvent, Event, EventEmitter, Disposable } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as querystring from 'querystring';

import { Kubectl } from '../../kubectl';
import { Host } from '../../host';
import { ShellResult } from '../../shell';

export const K8S_LOGS_RESOURCE_SCHEME = "k8smslogs";
export const K8S_LOGS_RESOURCE_AUTHORITY = "kuberneteslogs";

export function kubelogsfsUri(namespace: string | null, value: string): Uri {
    const docname = `${value.replace('/', '-')}.log`;
    const nonce = new Date().getTime();
    const nsquery = namespace ? `ns=${namespace}&` : '';
    const uri = `${K8S_LOGS_RESOURCE_SCHEME}://${K8S_LOGS_RESOURCE_AUTHORITY}/${docname}?${nsquery}value=${value}&_=${nonce}`;
    return Uri.parse(uri);
}

export class KubernetesLogsVirtualFileSystemProvider implements FileSystemProvider {
    constructor(private readonly kubectl: Kubectl, private readonly host: Host, private readonly rootPath: string) { }

    private readonly onDidChangeFileEmitter: EventEmitter<FileChangeEvent[]> = new EventEmitter<FileChangeEvent[]>();

    onDidChangeFile: Event<FileChangeEvent[]> = this.onDidChangeFileEmitter.event;

    watch(_uri: Uri, _options: { recursive: boolean; excludes: string[] }): Disposable {
        // It would be quite neat to implement this to watch for changes
        // in the cluster and update the doc accordingly.  But that is very
        // definitely a future enhancement thing!
        return new Disposable(() => {});
    }

    stat(_uri: Uri): FileStat {
        return {
            type: FileType.File,
            ctime: 0,
            mtime: 0,
            size: 65536  // These files don't seem to matter for us
        };
    }

    readDirectory(_uri: Uri): [string, FileType][] | Thenable<[string, FileType][]> {
        return [];
    }

    createDirectory(_uri: Uri): void | Thenable<void> {
        // no-op
    }

    readFile(uri: Uri): Uint8Array | Thenable<Uint8Array> {
        return this.readFileAsync(uri);
    }

    async readFileAsync(uri: Uri): Promise<Uint8Array> {
        const content = await this.loadLogs(uri);
        return new Buffer(content, 'utf8');
    }

    async loadLogs(uri: Uri): Promise<string> {
        const query = querystring.parse(uri.query);

        const value = query.value;
        const ns = query.ns;

        const sr = await this.execLoadLogs(ns, value);

        if (!sr ||  sr.code !== 0) {
            const message = 'Logs command failed: ' + (sr ? sr.stderr : "Unable to run kubectl");
            this.host.showErrorMessage(message);
            throw message;
        }

        return sr.stdout;
    }

    async execLoadLogs(ns: string | undefined, value: string): Promise<ShellResult | undefined> {
        const nsarg = ns ? `--namespace ${ns}` : '';
        return await this.kubectl.invokeAsyncWithProgress(`logs ${value} ${nsarg}`, `Loading logs for ${value}...`);
    }

    writeFile(uri: Uri, content: Uint8Array, _options: { create: boolean, overwrite: boolean }): void | Thenable<void> {
        // This assumes no pathing in the URI - if this changes, we'll need to
        // create subdirectories.
        const fspath = path.join(this.rootPath, uri.fsPath);
        fs.writeFileSync(fspath, content);
    }

    delete(_uri: Uri, _options: { recursive: boolean }): void | Thenable<void> {
        // no-op
    }

    rename(_oldUri: Uri, _newUri: Uri, _options: { overwrite: boolean }): void | Thenable<void> {
        // no-op
    }
}
