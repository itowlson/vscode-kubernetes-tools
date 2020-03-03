# Custom Diagnostics for Kubernetes Manifests

The Kubernetes extension provides some basic diagnostics to warn of potential
problems in Kubernetes manifests, and you can extend those using the Diagnostics
API.  You might do this if:

* You are writing an extension based around a particular topic or tool (for example,
  security, policy or performance), and there are checks that relate to that.
* You have checks that relate to your environment, such as team naming conventions
  or approved container registries, and you would like to run them as you write manifests.

**NOTE:** Because Kubernetes manifests are just YAML or JSON files, writing Kubernetes
diagnostics doesn't have to depend on the Kubernetes extension - you can write an extension
using the normal Visual Studio Code API. However, the Kubernetes extension adds a little
bit of convenience by hooking all the document events required to run checks at the right
time; your diagnostics will also automatically participate in the `disable-linters` opt-out
mechanism.

## Elements of a diagnostics contributor

An object that provides diagnostics, and optionally fixes, is called a _diagnostics contributor_.
Diagnostics contributors must be hosted within a Visual Studio Code extension.  This table
summarises what your node contributors and their hosting extension need to do;
the rest of this article goes into detail.

| Component                | Responsibilities                                                                    |
|--------------------------|-------------------------------------------------------------------------------------|
| Your extension           | Activate in response to `yaml`, `json` and `helm` language documents                |
|                          | Register diagnostics contributor(s) with Kubernetes extension                       |
| Diagnostics contributor  | Implement the diagnostics contributor interface                                     |
| Kubernetes extension     | Run the diagnostics contributor whenever a Kubernetes manifest is opened or changed |

## Implementing the diagnostics contributor

A diagnostics contibutor must implement the following interface.  (For documentation purposes
the interface is written in TypeScript terms but any JavaScript object that provides
the specified properties and methods will do.)

```javascript
interface DiagnosticsContributor {
    // required
    readonly name: string;
    analyse(document: vscode.TextDocument): vscode.Diagnostic[] | IterableIterator<vscode.Diagnostic> | Promise<vscode.Diagnostic[]> | Promise<IterableIterator<vscode.Diagnostic>>;
    // optional
    codeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): Promise<(vscode.Command | vscode.CodeAction)[]>;
}
```

(Although the return type of `analyse` looks intimidating, this is simply to give you
flexibility, first in implementing it as a generator instead of building an array, and
second to be synchronous or asynchronous according to need.)

The `name` is used in the `disable-linter` configuration entry if the user doesn't want to run
a particular diagnostic.  It can be anything reasonably unique.

## Implementing the analyser

The `analyse` method should examine the document and report any problems by returning
`vscode.Diagnostic` objects. It's up to you how to do this, but this section provides some
tips.

### Analysing the document

Your `analyse` method gets a `vscode.TextDocument`, from which it's up to you to extract
the text and identify any problems.  In the simplest cases you may be able to work with
the text as a string but normally you will want to parse it.  This can be done using
general-purpose YAML or JSON parsers or you can use the `k8s-manifest-parser` NPM package,
which provides simplified views that will suffice for most Kubernetes manifest diagnostics.

The typical flow of the `analyse` method is:

* Get the text from the document using `document.getText()`
* Get the language using `document.languageId` - this will be `yaml`, `json` or `helm`
* Parse the text according to the language
* Either:
  * Examine a specific part of the parse tree to see if it has the problem you're checking for
  * Walk the parse tree (or part of it) to see if any parts of it exhibit the problem you're checking for

### Returning the diagnostics

The return type of `analyse` is intentionally flexible.  You can choose whether to:

* Implement it as a synchronous or asynchronous function.  The asynchronous option
  is useful if you need to examine external resources such as a policy resource or
  schema file.
* Implement it as a 'normal' function (returning an array) or as a generator (returning
  an iterator).  For example if you are iterating over a series of entries then it
  may be more convenient to `yield` each diagnostic as you calculate it, rather than
  explicitly `push`-ing diagnostics onto the end of an array.

### Example 1 - rough and ready

Suppose your organisation has a policy that forbids the use of certain container registries.
Because registry URLs are usually distinctive, you can get a pretty good sense for this
just by scanning the text for those URLs:

```javascript
const EVILBAD_REGISTRY = 'evilbad.io';

function* analyse(document: vscode.TextDocument): IterableIterator<vscode.Diagnostic> {
    const text = document.getText();
    let soFar = 0;
    while (true) {
        const badRegistryIndex = text.indexOf(EVILBAD_REGISTRY, soFar);
        if (badRegistryIndex < 0>) {
            return;
        }
        const range = new vscode.Range(
            document.positionAt(badRegistryIndex),
            document.positionAt(badRegistryIndex + EVILBAD_REGISTRY.length)
        );
        yield new vscode.Diagnostic(range, 'Do not use evilbad.io', vscode.DiagnosticSeverity.Warning);
        soFar = badRegistryIndex + EVILBAD_REGISTRY.length;
    }
}
```

### Example 2 - smarter scanning

Text scanning as in example 1 works well enough if you just want to look for unusual strings and
don't care too much about context, but most diagnostics require a more structured approach.
For example, text scanning can warn on unapproved registries, but isn't enough to check that
image references come only from _approved_ registries.

The `k8s-manifest-parser` package can help with this.  The following sample looks for any
`image` property in the document and confirms that it starts with one of the approved registries.

```javascript
import * as kp from 'k8s-manifest-parser';

const APPROVED_REGISTRIES = ['safegood.io', 'happynice.io'];

function analyse(document: vscode.TextDocument): vscode.Diagnostic[] {
    if (document.languageId !== 'yaml') {
        return [];
    }

    const text = document.getText();
    const parses = kp.parseYAML(text);

    // 'evaluate' runs 'checkImageApproved' on all string values in the manifest(s)
    // and concatenates the results
    return kp.evaluate(parses, { onString: checkImageApproved })

    // The actual checker. 'evaluate' runs it for every string value in the manifest,
    // and it yields a diagnostic if the string is an image that isn't from an approved
    // registry.
    function* checkImageApproved(value: kp.StringValue, ancestors: ReadonlyArray<kp.Ancestor>) {
        // Is the string we're looking at the right hand side of an "image: ..." property?
        if (ancestors.length > 0 && ancestors[0].at === 'image') {
            // If so, does the image reference start with one of the approved registries
            const image = value.value;
            for (const approved of APPROVED_REGISTRIES) {
                if (image.startsWith(`${approved}/`)) {  // NOTE: this check could and should be more rigorous!
                    // It does, so don't emit a diagnostic
                    return;
                }
            }
            // If we got here, none of the approved registries matched, so yield a warning
            yield new vscode.Diagnostic(
                rangeOf(value.range),
                `Image ${image} is not from any of the approved registries`,
                vscode.DiagnosticSeverity.Warning
            );
        }
    }

    // Helper function for converting a parser range into one that VS Code can use
    function rangeOf(r: kp.Range) {
        return new vscode.Range(document.positionAt(r.start), document.positionAt(r.end));
    }
}
```

### Example 3 - targeted analysis

Example 2 shows how to search across the entire document for problematic patterns.  If, however,
you are writing a diagnostic for a specific part of the manifest, then `k8s-manifest-parser`
has functions for examining those parts specifically.  Suppose you want to check that all pods
specify memory limits.  We can find that in the `spec.containers[...].resources.limits.memory`
section of the pod manifest.

```javascript
import * as kp from 'k8s-manifest-parser';

function analyse(document: vscode.TextDocument): vscode.Diagnostic[] {
    if (document.languageId !== 'yaml') {
        return [];
    }

    // For this sample we're only interested in YAML that represents pods
    const text = document.getText();
    const pods = kp.parseYAML(text)
                   .filter((r) => kp.isKind(r, 'Pod'))  // YAML could contain multiple manifests; consider only pods
                   .map((r) => kp.asTraversable(r));  // makes it easier to address specific elements

    const diagnostics = Array.of<vscode.Diagnostic>();

    for (const pod of pods) {
        const containers = pod.map('spec').array('containers');
        if (!containers.valid()) {
            break;  // The pod doesn't conform to schema; there's no point looking further
        }

        // maps() returns each item in the containers array, typed as a map
        for (const container of containers.maps()) {

            // Every pod should have a resources.limits.memory entry...
            const memoryLimit = container.map('resources').map('limits').child('memory');

            // ...so if one doesn't...
            if (!memoryLimit.exists()) {
                // ...add a diagnostic
                diagnostics.push(new vscode.Diagnostic(
                    rangeOf(kp.highlightRange(memoryLimit)),  // memoryLimit doesn't exist so we can't use its range - highlightRange finds the nearest parent that exists
                    "Please provide a memory limit",
                    vscode.DiagnosticSeverity.Warning
                ));
            }
        }
    }

    return diagnostics;

    // Helper function for converting a parser range into one that VS Code can use
    function rangeOf(r: kp.Range) {
        return new vscode.Range(document.positionAt(r.start), document.positionAt(r.end));
    }
}
```

See the `k8s-manifest-parser` documentation for more information and examples.

## Implementing code actions

Code actions are implemented just as in the usual Visual Studio Code CodeActionProvider type.
See the Visual Studio Code documentation for more information.

## Registering the diagnostics contributor

In order to provide diagnostics, a diagnostics contributor must be _registered_ with
the Kubernetes extension.  This is the responsibility of the VS Code extension
that hosts the diagnostics contributor.  To do this, the extension must:

* Activate in response to the `yaml`, `json` and `helm` languages
* Request the Kubernetes extension's Diagnostics API
* Call the `registerDiagnosticsContributor` method for each diagnostics contributor it contains

### Activating the diagnostics extension

Your extension needs to activate when a Kubernetes manifest is loaded, so that it can
register its diagnostic contributors and have them appear on documents without user
intervention.  To do this, your `package.json` must include the following activation events:

```json
    "activationEvents": [
        "onLanguage:yaml",
        "onLanguage:json",
        "onLanguage:helm"
    ],
```

Depending on your extension you may have other activation events as well.

### Registering diagnostic contributors with the Kubernetes extension

In your extension's `activate` function, you must register your contributor(s) using the
Kubernetes extension API.  The following sample shows how to do this using the NPM
helper package; if you don't use the helper then the process of requesting the API is
more manual but the registration is the same.

```javascript
const MY_DIAGNOSTICS = {
    name: "contoso-policies",
    analyse: verifyPolicies,
    codeActions: provideFixes  // optional
};

export async function activate(context: vscode.ExtensionContext) {
    const diagnostics = await k8s.extension.diagnostics.v1;

    if (!diagnostics.available) {
        console.log("Unable to provide diagnostics: " + cp.reason);
        return;
    }

    diagnostics.api.registerDiagnosticsContributor(MY_DIAGNOSTICS);
}
```

Your diagnostics contributor is now ready for testing!

