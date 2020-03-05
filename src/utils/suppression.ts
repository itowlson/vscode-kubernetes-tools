import { ExtensionContext } from "vscode";

let extensionContext: ExtensionContext | undefined = undefined;

export function initialiseSuppressionContext(context: ExtensionContext) {
    extensionContext = context;
}

export interface SuppressionSettings {
    readonly suppressionKey: string;
    readonly suppressionDays: number;
}

export const INSTALL_DEPENDENCIES_SUPPRESSION_SETTINGS: SuppressionSettings = {
    suppressionKey: 'install-dependencies-do-not-remind-until',
    suppressionDays: 30
};

export const IGNORE_SUPPRESSION_SETTINGS: SuppressionSettings = {
    suppressionKey: '7f81f9d8-79be-48d8-a118-e3a45194255f',
    suppressionDays: 0
};

export function suppressible(settings: SuppressionSettings): boolean {
    return settings.suppressionKey !== IGNORE_SUPPRESSION_SETTINGS.suppressionKey;
}

export function setSuppressed(settings: SuppressionSettings): void {
    if (!extensionContext) {
        return;
    }

    const suppressUntil = new Date().valueOf() + (settings.suppressionDays * 24 * 60 * 60 * 1000);
    extensionContext.globalState.update(settings.suppressionKey, suppressUntil);
}

export function shouldSuppress(settings: SuppressionSettings): boolean {
    if (!extensionContext) {
        return false;
    }
    if (!suppressible(settings)) {
        return false;
    }

    const suppressUntil = extensionContext.globalState.get<number>(settings.suppressionKey, 0);
    const now = new Date().valueOf();
    return (now < suppressUntil);
}
