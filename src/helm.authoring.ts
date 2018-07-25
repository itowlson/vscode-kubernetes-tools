import * as vscode from 'vscode';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { FS } from './fs';
import { Host } from './host';

interface Context {
    readonly fs: FS;
    readonly host: Host;
    readonly projectPath: string;
}

interface Chart {
    name: string;
    path: string;
}

export function convertToTemplate(fs: FS, host: Host, projectPath: string, uri: vscode.Uri | undefined): void {
    const context = { fs, host, projectPath };
    const activeDocument = host.activeDocument();
    if (uri) {
        // it's a file explorer click
        addChartFrom(context, uri.fsPath);
    } else if (activeDocument) {
        addChart(context, activeDocument.getText());
    } else {
        host.showErrorMessage("This command requires a YAML file open or selected in the Explorer.");
    }
}

// What it needs to do:
// * How many charts already exist in this project?  (A chart is a diorectory containing
//   a Chart.yaml file.)
//   - None - we need to helm create one.  (But this will create scaffolding - do we want that?)
//   - One - we need to add the template to that chart.
//   - Several - we need to prompt for which chart to add it to.
// * Then we create a file in chart_dir/templates
//   - Do we need to create anything in chart_dir/charts?  (No - this is for dependent charts.)
// * Copy the resource/active doc YAML to the new file
// * Strip out output-only stuff such as status
// * Paramterise anything we can reliably parameterise
//   - Change it to a values.* (or something-else.*?) reference
//   - Add the * to values.yaml if required
// * Add Helm boilerplate such as chart: labels

async function addChartFrom(context: Context, fsPath: string): Promise<void> {
    const yaml = context.fs.readFileSync(fsPath, 'utf-8');
    await addChart(context, yaml);
}

async function addChart(context: Context, resourceYaml: string): Promise<void> {
    // TODO: check text is valid YAML
    const chart = await pickOrCreateChart(context);
    if (!chart) {
        return;
    }

    const template = yaml.safeLoad(resourceYaml);
    foldSpindleAndMutilate(template);

    // TODO: offer a default
    const templateName = await context.host.showInputBox({ prompt: "Name for the new template" });
    if (!templateName) {
        return;
    }

    const templateFile = path.join(chart.path, "templates", templateName + ".yaml");
    // TODO: check if file already exists

    const templateYaml = yaml.safeDump(template);  // the parse-dump cycle can change the indentation of collections - is this an issue?
    const templateText = fixYamlValueQuoting(templateYaml);
    context.fs.writeFileSync(templateFile, templateText);

    await context.host.openDocument(vscode.Uri.file(templateFile));
}

enum QuoteMode {
    None,
    Double,
}

const NAME_EXPRESSION = '{{ template "fullname" . }}';
const CHART_LABEL_EXPRESSION = '{{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}}';

const QUOTE_CONTROL_INFO = [
    { text: NAME_EXPRESSION, mode: QuoteMode.None },
    { text: CHART_LABEL_EXPRESSION, mode: QuoteMode.Double },
];

function foldSpindleAndMutilate(template: any): void {
    ensureMetadata(template);
    cleanseMetadata(template.metadata);

    template.metadata.name = NAME_EXPRESSION;
    template.metadata.labels.chart = CHART_LABEL_EXPRESSION;

    // TODO: should we auto parameterise certain fields depending on the kind?
    // E.g. spec.template.metadata.labels.app, is that always meant to be set?
    // (Is there always a spec?)

    delete template.status;
}

function ensureMetadata(template: any): void {
    template.metadata = template.metadata || {};
    template.metadata.labels = template.metadata.labels || {};
}

function cleanseMetadata(metadata: any): void {
    delete metadata.clusterName;
    delete metadata.creationTimestamp;
    delete metadata.deletionTimestamp;
    delete metadata.generation;
    delete metadata.generateName;
    delete metadata.namespace;
    delete metadata.resourceVersion;
    delete metadata.selfLink;
    delete metadata.uid;
}

function chartsInProject(context: Context): Chart[] {
    const fs = context.fs;
    return subdirectories(fs, context.projectPath)
             .filter((d) => fs.existsSync(path.join(d, "Chart.yaml")))
             .map((d) => ({ name: path.basename(d), path: d }));
}

function subdirectories(fs: FS, directory: string): string[] {
    const immediate = fs.dirSync(directory)
                        .map((e) => path.join(directory, e))
                        .filter((e) => fs.statSync(e).isDirectory());
    const indirect = immediate.map((d) => subdirectories(fs, d));
    return immediate.concat(...indirect);
}

async function pickOrCreateChart(context: Context): Promise<Chart | undefined> {
    // TODO: refactor helmexec.pickChart so we can leverage it here
    const charts = chartsInProject(context);
    switch (charts.length) {
        case 0:
            // for now.  Sad!
            context.host.showErrorMessage("No charts found.");
            return undefined;
        case 1:
            return charts[0];
        default:
            const chartPicks = charts.map((c) => ({ label: c.name, chart: c }));
            const pick = await context.host.showQuickPick(chartPicks, { placeHolder: 'Select chart to add the new template to'  });
            return pick ? pick.chart : undefined;
    }
}

function fixYamlValueQuoting(yamlText: string): string {
    let text = yamlText;
    for (const expr of QUOTE_CONTROL_INFO) {
        const q = expr.mode === QuoteMode.Double ? '"' : '';
        text = text.replace(`'${expr.text}'`, `${q}${expr.text}${q}`);
    }
    return text;
}
