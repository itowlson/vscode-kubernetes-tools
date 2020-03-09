import { Host } from './host';
import { FS } from './fs';
import { Shell } from './shell';
import { installDependencies } from "./components/installer/installdependencies";
import { getToolPath, getUseWsl } from './components/config/config';

export interface ExternalBinary {
    readonly displayName: string;
    readonly binBaseName: string;
    readonly configKeyName: string;
    readonly offersInstall: boolean;
}

export interface ExecBinNotFound {
    readonly resultKind: 'exec-bin-not-found';
    readonly findResult: FindBinaryStatus;
}

export interface ExecFailed {
    readonly resultKind: 'exec-failed';
}

export interface ExecSucceeded {
    readonly resultKind: 'exec-succeeded';
    readonly stdout: string;
}

export interface ExecErrored {
    readonly resultKind: 'exec-errored';
    readonly code: number;
    readonly stderr: string;
}

export type ExecResult = ExecBinNotFound | ExecFailed | ExecSucceeded | ExecErrored;

export interface BinaryFound {
    readonly found: true;
    readonly how: 'config' | 'path';
    readonly where: string;
}

export interface ConfiguredBinaryNotFound {
    readonly found: false;
    readonly how: 'config';
    readonly where: string;
}

export interface UnconfiguredBinaryNotFound {
    readonly found: false;
    readonly how: 'path';
}

export type FindBinaryStatus = BinaryFound | ConfiguredBinaryNotFound | UnconfiguredBinaryNotFound;

export interface Context {
    readonly host: Host;
    readonly fs: FS;
    readonly shell: Shell;
    readonly pathfinder: (() => Promise<string>) | undefined;
    readonly binary: ExternalBinary;
    status: FindBinaryStatus | undefined;
}

async function unquotedBaseBinPath(context: Context): Promise<string> {
    if (context.pathfinder) {
        return await context.pathfinder();
    }
    if (context.status && context.status.found && context.status.how === 'config') {
        return context.status.where!;
    }
    return context.binary.binBaseName;
}

async function baseBinPath(context: Context): Promise<string> {
    let binPath = await unquotedBaseBinPath(context);
    if (binPath && binPath.includes(' ')) {
        binPath = `"${binPath}"`;
    }
    return binPath;
}

// This is silent - just caching over findBinaryCore
async function findBinary(context: Context): Promise<FindBinaryStatus> {
    if (context.status && context.status.found) {
        return context.status;
    }

    const fbr = await findBinaryCore(context);

    context.status = fbr;

    return fbr;
}

// This is silent: tells us whether we can find the required binary
async function findBinaryCore(context: Context): Promise<FindBinaryStatus> {
    // Do we have a configured location?
    const configuredPath = getToolPath(context.host, context.shell, context.binary.configKeyName);
    if (configuredPath) {
        // Does the file exist?
        if (getUseWsl()) {
            const sr = await context.shell.exec(`ls ${configuredPath}`);
            const found = (!!sr && sr.code === 0);
            return { found, how: 'config', where: configuredPath };
        } else {
            const found = await context.fs.existsAsync(configuredPath);
            return { found, how: 'config', where: configuredPath };
        }
    }

    // No config so look on the system PATH
    const cmd = context.shell.isWindows() ? `where.exe ${context.binary.binBaseName}.exe` : `which ${context.binary.binBaseName}`;

    const opts = {
        async: true,
        env: {
            HOME: process.env.HOME,
            PATH: process.env.PATH
        }
    };

    const execResult = await context.shell.execCore(cmd, opts);
    if (execResult.code !== 0) {
        return { found: false, how: 'path' };
    }

    return { found: true, how: 'path', where: execResult.stdout };
}

// This is silent - building block for experiences that need an input->output invoke
async function invokeForResult(context: Context, command: string, stdin: string | undefined): Promise<ExecResult> {
    const fbr = await findBinary(context);
    if (!fbr.found) {
        return { resultKind: 'exec-bin-not-found', findResult: fbr };
    }

    const bin = await baseBinPath(context);
    const cmd = `${bin} ${command}`;
    const sr = await context.shell.exec(cmd, stdin);

    if (!sr) {
        return { resultKind: 'exec-failed' };
    }

    if (sr.code === 0) {
        return { resultKind: 'exec-succeeded', stdout: sr.stdout };
    }

    return { resultKind: 'exec-errored', code: sr.code, stderr: sr.stderr };
}

// This is noisy - handles failure UI for an interactive command that performs an invokeForResult
async function discardFailureInteractive(context: Context, result: ExecResult): Promise<ExecSucceeded | undefined> {
    switch (result.resultKind) {
        case 'exec-bin-not-found':
            await showErrorMessageWithInstallPrompt(context, result.findResult, 'Kubectl command failed: kubectl not found');
            return undefined;
        case 'exec-failed':
            await context.host.showErrorMessage('Kubectl command failed: unable to run kubectl');
            return undefined;
        case 'exec-errored':
            await context.host.showErrorMessage(`Kubectl command failed: ${result.stderr}`);
            return undefined;
        case 'exec-succeeded':
            return result;
    }
}

async function showErrorMessageWithInstallPrompt(context: Context, findResult: FindBinaryStatus, message: string): Promise<void> {
    const binary = context.binary;
    switch (findResult.how) {
        case 'path':
            return showErrorMessageWithInstallPromptForSystemPath(context, message, binary);
        case 'config':
            return showErrorMessageWithInstallPromptForConfiguredBinPath(context, message);
    }
}

async function showErrorMessageWithInstallPromptForSystemPath(context: Context, message: string, binary: ExternalBinary) {
    const choice = await context.host.showErrorMessage(message, 'Install dependencies', 'Learn more');
    switch (choice) {
        case 'Learn more':
            context.host.showInformationMessage(`Add '${binary.binBaseName}' directory to path, or set "vs-kubernetes.${binary.configKeyName}-path" config to ${binary.binBaseName} binary.`);
            break;
        case 'Install dependencies':
            installDependencies();
            break;
    }
}

async function showErrorMessageWithInstallPromptForConfiguredBinPath(context: Context, message: string) {
    const choice = await context.host.showErrorMessage(message, 'Install dependencies');
    if (choice === 'Install dependencies') {
        installDependencies();
    }
}