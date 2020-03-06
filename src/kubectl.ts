import { Terminal, Disposable } from 'vscode';
import { ChildProcess, spawn as spawnChildProcess } from "child_process";
import { Host } from './host';
import { FS } from './fs';
import { Shell, ShellHandler, ShellResult } from './shell';
import * as binutil from './binutil';
import { Errorable } from './errorable';
import { parseLineOutput } from './outputUtils';
import * as compatibility from './components/kubectl/compatibility';
import { getToolPath, affectsUs, getUseWsl, KubectlVersioning } from './components/config/config';
import { ensureSuitableKubectl } from './components/kubectl/autoversion';
import { updateYAMLSchema } from './yaml-support/yaml-schema';

const KUBECTL_OUTPUT_COLUMN_SEPARATOR = /\s\s+/g;

export interface Kubectl {
    checkPresent(reason: InvokeReason): Promise<boolean>;
    invoke(reason: InvokeReason, command: string, handler?: ShellHandler): Promise<void>;
    invokeWithProgress(reason: InvokeReason, command: string, progressMessage: string, handler?: ShellHandler): Promise<void>;
    invokeAsync(reason: InvokeReason, command: string, stdin?: string, callback?: (proc: ChildProcess) => void): Promise<ShellResult | undefined>;
    invokeAsyncWithProgress(reason: InvokeReason, command: string, progressMessage: string): Promise<ShellResult | undefined>;
    spawnAsChild(reason: InvokeReason, command: string[]): Promise<ChildProcess | undefined>;
    /**
     * Invoke a kubectl command in Terminal.
     * @param command the subcommand to run.
     * @param terminalName if empty, run the command in the shared Terminal; otherwise run it in a new Terminal.
     */
    invokeInNewTerminal(reason: InvokeReason, command: string, terminalName: string, onClose?: (e: Terminal) => any, pipeTo?: string): Promise<Disposable>;
    invokeInSharedTerminal(reason: InvokeReason, command: string): Promise<void>;
    runAsTerminal(reason: InvokeReason, command: string[], terminalName: string): Promise<void>;
    asLines(reason: InvokeReason, command: string): Promise<Errorable<string[]>>;
    fromLines(reason: InvokeReason, command: string): Promise<Errorable<{ [key: string]: string }[]>>;
    asJson<T>(reason: InvokeReason, command: string): Promise<Errorable<T>>;
}

interface Context {
    readonly host: Host;
    readonly fs: FS;
    readonly shell: Shell;
    readonly installDependenciesCallback: () => void;
    readonly pathfinder: (() => Promise<string>) | undefined;
    binFound: boolean;
    binPath: string;
}

class KubectlImpl implements Kubectl {
    constructor(host: Host, fs: FS, shell: Shell, installDependenciesCallback: () => void, pathfinder: (() => Promise<string>) | undefined, kubectlFound: boolean) {
        this.context = {
            host : host,
            fs : fs,
            shell : shell,
            installDependenciesCallback : installDependenciesCallback,
            pathfinder: pathfinder,
            binFound : kubectlFound,
            binPath : 'kubectl'
        };
    }

    private readonly context: Context;
    private sharedTerminal: Terminal | null = null;

    checkPresent(reason: InvokeReason): Promise<boolean> {
        return checkPresent(this.context, reason);
    }
    invoke(reason: InvokeReason, command: string, handler?: ShellHandler): Promise<void> {
        return invoke(this.context, reason, command, handler);
    }
    invokeWithProgress(reason: InvokeReason, command: string, progressMessage: string, handler?: ShellHandler): Promise<void> {
        return invokeWithProgress(this.context, reason, command, progressMessage, handler);
    }
    invokeAsync(reason: InvokeReason, command: string, stdin?: string, callback?: (proc: ChildProcess) => void): Promise<ShellResult | undefined> {
        return invokeAsync(this.context, reason, command, stdin, callback);
    }
    invokeAsyncWithProgress(reason: InvokeReason, command: string, progressMessage: string): Promise<ShellResult | undefined> {
        return invokeAsyncWithProgress(this.context, reason, command, progressMessage);
    }
    spawnAsChild(reason: InvokeReason, command: string[]): Promise<ChildProcess | undefined> {
        return spawnAsChild(this.context, reason, command);
    }
    async invokeInNewTerminal(reason: InvokeReason, command: string, terminalName: string, onClose?: (e: Terminal) => any, pipeTo?: string): Promise<Disposable> {
        const terminal = this.context.host.createTerminal(terminalName);
        const disposable = onClose ? this.context.host.onDidCloseTerminal(onClose) : new Disposable(() => {});
        await invokeInTerminal(this.context, reason, command, pipeTo, terminal);
        return disposable;
    }
    invokeInSharedTerminal(reason: InvokeReason, command: string): Promise<void> {
        const terminal = this.getSharedTerminal();
        return invokeInTerminal(this.context, reason, command, undefined, terminal);
    }
    runAsTerminal(reason: InvokeReason, command: string[], terminalName: string): Promise<void> {
        return runAsTerminal(this.context, reason, command, terminalName);
    }
    asLines(reason: InvokeReason, command: string): Promise<Errorable<string[]>> {
        return asLines(this.context, reason, command);
    }
    fromLines(reason: InvokeReason, command: string): Promise<Errorable<{ [key: string]: string }[]>> {
        return fromLines(this.context, reason, command);
    }
    asJson<T>(reason: InvokeReason, command: string): Promise<Errorable<T>> {
        return asJson(this.context, reason, command);
    }
    private getSharedTerminal(): Terminal {
        if (!this.sharedTerminal) {
            this.sharedTerminal = this.context.host.createTerminal('kubectl');
            const disposable = this.context.host.onDidCloseTerminal((terminal) => {
                if (terminal === this.sharedTerminal) {
                    this.sharedTerminal = null;
                    disposable.dispose();
                }
            });
            this.context.host.onDidChangeConfiguration((change) => {
                if (affectsUs(change) && this.sharedTerminal) {
                    this.sharedTerminal.dispose();
                }
            });
        }
        return this.sharedTerminal;
    }
}

export function create(versioning: KubectlVersioning, host: Host, fs: FS, shell: Shell, installDependenciesCallback: () => void): Kubectl {
    if (versioning === KubectlVersioning.Infer) {
        return createAutoVersioned(host, fs, shell, installDependenciesCallback);
    }
    return createSingleVersion(host, fs, shell, installDependenciesCallback);
}

function createSingleVersion(host: Host, fs: FS, shell: Shell, installDependenciesCallback: () => void): Kubectl {
    return new KubectlImpl(host, fs, shell, installDependenciesCallback, undefined, false);
}

function createAutoVersioned(host: Host, fs: FS, shell: Shell, installDependenciesCallback: () => void): Kubectl {
    const bootstrapper = createSingleVersion(host, fs, shell, installDependenciesCallback);
    const pathfinder = async () => (await ensureSuitableKubectl(bootstrapper, shell, host)) || 'kubectl';
    return new KubectlImpl(host, fs, shell, installDependenciesCallback, pathfinder, false);
}

export function createOnBinary(host: Host, fs: FS, shell: Shell, bin: string): Kubectl {
    const pathfinder = async () => bin;
    return new KubectlImpl(host, fs, shell, () => {}, pathfinder, false);
}

export enum InvokeReason {
    ExtensionActivating,
    LocatingBinary,
    UserCommand,
    UserClusterExplorerAction,
    BackgroundFetchSchema,
    BackgroundClusterStatus,
    ClusterVersionCheck,
    InvokedViaAPI,
    MysteryReason,
}

async function checkPresent(context: Context, reason: InvokeReason): Promise<boolean> {
    if (context.binFound || context.pathfinder) {
        return true;
    }

    return await checkForKubectlInternal(context, reason);
}

async function checkForKubectlInternal(context: Context, reason: InvokeReason): Promise<boolean> {
    const binName = 'kubectl';
    const bin = getToolPath(context.host, context.shell, binName);

    const contextMessage = getCheckKubectlContextMessage(reason);
    const inferFailedMessage = `Could not find "${binName}" binary.${contextMessage}`;
    const configuredFileMissingMessage = `${bin} does not exist! ${contextMessage}`;

    return await binutil.checkForBinary(context, bin, binName, inferFailedMessage, configuredFileMissingMessage, errorMessageMode !== CheckPresentMessageMode.Silent);
}

function getCheckKubectlContextMessage(reason: InvokeReason): string {
    if (reason === InvokeReason.ExtensionActivating) {
        return ' Kubernetes commands other than configuration will not function correctly.';
    } else if (reason === InvokeReason.UserCommand) {
        return ' Cannot execute command.';
    } else if (reason === InvokeReason.UserClusterExplorerAction) {
        return ' Cannot update display.';
    }
    return '';
}

async function invoke(context: Context, reason: InvokeReason, command: string, handler?: ShellHandler): Promise<void> {
    await kubectlInternal(context, reason, command, handler || kubectlDone(context));
}

async function invokeWithProgress(context: Context, reason: InvokeReason, command: string, progressMessage: string, handler?: ShellHandler): Promise<void> {
    return context.host.withProgress((p) => {
        return new Promise<void>((resolve) => {
            p.report({ message: progressMessage });
            kubectlInternal(context, reason, command, (code, stdout, stderr) => {
                resolve();
                (handler || kubectlDone(context))(code, stdout, stderr);
            });
        });
    });
}

async function invokeAsync(context: Context, reason: InvokeReason, command: string, stdin?: string, callback?: (proc: ChildProcess) => void): Promise<ShellResult | undefined> {
    if (await checkPresent(context, reason)) {
        const bin = await baseKubectlPath(context);
        const cmd = `${bin} ${command}`;
        let sr: ShellResult | undefined;
        if (stdin) {
            sr = await context.shell.exec(cmd, stdin);
        } else {
            sr = await context.shell.execStreaming(cmd, callback);
        }
        if (sr && sr.code !== 0) {
            checkPossibleIncompatibility(context);
        }
        return sr;
    } else {
        return { code: -1, stdout: '', stderr: '' };
    }
}

// TODO: invalidate this when the context changes or if we know kubectl has changed (e.g. config)
let checkedCompatibility = false;  // We don't want to spam the user (or CPU!) repeatedly running the version check

async function checkPossibleIncompatibility(context: Context): Promise<void> {
    if (checkedCompatibility) {
        return;
    }
    checkedCompatibility = true;
    const compat = await compatibility.check((cmd) => asJson<compatibility.Version>(context, InvokeReason.ClusterVersionCheck, cmd));
    if (!compatibility.isGuaranteedCompatible(compat) && compat.didCheck) {
        const versionAlert = `kubectl version ${compat.clientVersion} may be incompatible with cluster Kubernetes version ${compat.serverVersion}`;
        context.host.showWarningMessage(versionAlert);
    }
}

async function invokeAsyncWithProgress(context: Context, reason: InvokeReason, command: string, progressMessage: string): Promise<ShellResult | undefined> {
    return context.host.longRunning(progressMessage, () => invokeAsync(context, reason, command));
}

async function spawnAsChild(context: Context, reason: InvokeReason, command: string[]): Promise<ChildProcess | undefined> {
    if (await checkPresent(context, reason)) {
        return spawnChildProcess(await path(context), command, context.shell.execOpts());
    }
    return undefined;
}

async function invokeInTerminal(context: Context, reason: InvokeReason, command: string, pipeTo: string | undefined, terminal: Terminal): Promise<void> {
    if (await checkPresent(context, reason)) {
        // You might be tempted to think we needed to add 'wsl' here if user is using wsl
        // but this runs in the context of a vanilla terminal, which is controlled by the
        // existing preference, so it's not necessary.
        // But a user does need to default VS code to use WSL in the settings.json
        const kubectlCommand = `kubectl ${command}`;
        const fullCommand = pipeTo ? `${kubectlCommand} | ${pipeTo}` : kubectlCommand;
        terminal.sendText(fullCommand);
        terminal.show();
    }
}

async function runAsTerminal(context: Context, reason: InvokeReason, command: string[], terminalName: string): Promise<void> {
    if (await checkPresent(context, reason)) {
        let execPath = await path(context);
        const cmd = command;
        if (getUseWsl()) {
            cmd.unshift(execPath);
            // Note VS Code is picky here. It requires the '.exe' to work
            execPath = 'wsl.exe';
        }
        const term = context.host.createTerminal(terminalName, execPath, cmd);
        term.show();
    }
}

async function kubectlInternal(context: Context, reason: InvokeReason, command: string, handler: ShellHandler): Promise<void> {
    if (await checkPresent(context, reason)) {
        const bin = await baseKubectlPath(context);
        const cmd = `${bin} ${command}`;
        const sr = await context.shell.exec(cmd);
        if (sr) {
            handler(sr.code, sr.stdout, sr.stderr);
        }
    }
}

function kubectlDone(context: Context): ShellHandler {
    return (result: number, stdout: string, stderr: string) => {
        if (result !== 0) {
            context.host.showErrorMessage('Kubectl command failed: ' + stderr);
            console.log(stderr);
            checkPossibleIncompatibility(context);
            return;
        }

        updateYAMLSchema();  // TODO: I really do not like having this here. Massive separation of concerns red flag plus we lack context to decide whether it's needed. But hard to move without revamping the result handling system.
        context.host.showInformationMessage(stdout);
    };
}

async function unquotedBaseKubectlPath(context: Context): Promise<string> {
    if (context.pathfinder) {
        return await context.pathfinder();
    }
    let bin = getToolPath(context.host, context.shell, 'kubectl');
    if (!bin) {
        bin = 'kubectl';
    }
    return bin;
}

async function baseKubectlPath(context: Context): Promise<string> {
    let bin = await unquotedBaseKubectlPath(context);
    if (bin && bin.includes(' ')) {
        bin = `"${bin}"`;
    }
    return bin;
}

async function asLines(context: Context, reason: InvokeReason, command: string): Promise<Errorable<string[]>> {
    const shellResult = await invokeAsync(context, reason, command);
    if (!shellResult) {
        return { succeeded: false, error: [`Unable to run command (${command})`] };
    }

    if (shellResult.code === 0) {
        let lines = shellResult.stdout.split('\n');
        lines.shift();
        lines = lines.filter((l) => l.length > 0);
        return { succeeded: true, result: lines };

    }
    return { succeeded: false, error: [ shellResult.stderr ] };
}

async function fromLines(context: Context, reason: InvokeReason, command: string): Promise<Errorable<{ [key: string]: string }[]>> {
    const shellResult = await invokeAsync(context, reason, command);
    if (!shellResult) {
        return { succeeded: false, error: [`Unable to run command (${command})`] };
    }

    if (shellResult.code === 0) {
        let lines = shellResult.stdout.split('\n');
        lines = lines.filter((l) => l.length > 0);
        const parsedOutput = parseLineOutput(lines, KUBECTL_OUTPUT_COLUMN_SEPARATOR);
        return { succeeded: true, result: parsedOutput };
    }
    return { succeeded: false, error: [ shellResult.stderr ] };
}

async function asJson<T>(context: Context, reason: InvokeReason, command: string): Promise<Errorable<T>> {
    const shellResult = await invokeAsync(context, reason, command);
    if (!shellResult) {
        return { succeeded: false, error: [`Unable to run command (${command})`] };
    }

    if (shellResult.code === 0) {
        return { succeeded: true, result: JSON.parse(shellResult.stdout.trim()) as T };

    }
    return { succeeded: false, error: [ shellResult.stderr ] };
}

async function path(context: Context): Promise<string> {
    const bin = await baseKubectlPath(context);
    return binutil.execPath(context.shell, bin);
}
