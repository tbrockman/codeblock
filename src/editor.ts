import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState, Facet, StateEffect, StateField } from "@codemirror/state";
import { ViewPlugin, ViewUpdate, keymap, KeyBinding, Panel, showPanel } from "@codemirror/view";
import { debounce } from "lodash";
import { codeblockTheme } from "./theme";
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { getLanguageSupportForFile } from "./language";
import { indentWithTab } from "@codemirror/commands";
import { detectIndentationUnit } from "./utils";
import { indentString, indentUnit } from "@codemirror/language";
import { FS } from "./fs";
import { createDefaultMapFromCDN, createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs';
import ts from "typescript";
import lzstring from "lz-string";

// Configuration types and facets
type CodeblockConfig = { fs: FS; path: string; toolbar: boolean };

const CodeblockFacet = Facet.define<CodeblockConfig, CodeblockConfig>({
    combine: (values) => values[0]
});

// Compartments for dynamically reconfiguring extensions
const configCompartment = new Compartment();
const languageCompartment = new Compartment();
const indentationCompartment = new Compartment();
const tsEnvironmentCompartment = new Compartment();

// Create a custom panel for the toolbar
function toolbarPanel(view: EditorView): Panel {
    let { path } = view.state.facet(CodeblockFacet);
    const dom = document.createElement("div");
    dom.className = "cm-toolbar-panel";

    const input = document.createElement("input");
    input.type = "text";
    input.value = path;
    input.className = "cm-toolbar-input";

    // Handle input changes
    input.addEventListener("input", (event) => {
        const newPath = (event.target as HTMLInputElement).value;
        // Update the path in the facet
        view.dispatch({
            effects: configCompartment.reconfigure(CodeblockFacet.of({
                ...view.state.facet(CodeblockFacet),
                path: newPath
            }))
        });
    });

    // Handle moving down from input to editor
    input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            view.focus();
            view.dispatch({
                selection: { anchor: 0, head: 0 }
            });
            view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
        }
    });

    dom.appendChild(input);
    return {
        dom,
        top: true,
        mount() {
            // Optional: Add any initialization logic here
        },
        update() {
            // Update input value if path changes
            ({ path } = view.state.facet(CodeblockFacet));
            if (input.value !== path) {
                input.value = path;
            }
        }
    };
}

const navigationKeymap: KeyBinding[] = [{
    key: "ArrowUp",
    run: (view: EditorView) => {
        const cursor = view.state.selection.main;
        const line = view.state.doc.lineAt(cursor.head);
        const toolbarInput = view.dom.querySelector<HTMLElement>('.cm-toolbar-input');

        if (line.number === 1 && toolbarInput) {
            toolbarInput.focus();
            return true;
        }
        return false;
    }
}];

// Main codeblock plugin creation function
const codeblock = (initialConfig: CodeblockConfig) => {
    return [
        configCompartment.of(CodeblockFacet.of(initialConfig)),
        languageCompartment.of([]),
        indentationCompartment.of(indentUnit.of("    ")),
        tsEnvironmentCompartment.of([]),
        showPanel.of(initialConfig.toolbar ? toolbarPanel : null),
        codeblockTheme,
        codeblockView,
        keymap.of(navigationKeymap),
        keymap.of([indentWithTab]),
        vscodeDark
    ];
};
// The main view plugin that handles reactive updates and file syncing
const codeblockView = ViewPlugin.define((view: EditorView) => {
    let { fs, path } = view.state.facet(CodeblockFacet);
    let abortController = new AbortController();
    let initialized = false;

    // Save file changes to disk
    const save = debounce(async () => {
        console.log('save called', path, view.state.doc.toString());
        await fs.writeFile(path, view.state.doc.toString()).catch(console.error);
        const diskFile = await fs.readFile(path);
        console.log('disk file', diskFile);
    }, 500);

    // Function to setup file watching
    const startWatching = () => {
        abortController.abort(); // Cancel any existing watcher
        abortController = new AbortController();
        const { signal } = abortController;
        console.log('watching???');

        (async () => {
            try {
                for await (const _ of fs.watch(path, { signal })) {
                    try {
                        const content = await fs.readFile(path);
                        const doc = view.state.doc.toString();
                        console.log('watch event', { content, doc, equal: content === doc });

                        if (content === view.state.doc.toString()) continue;
                        view.dispatch({
                            changes: { from: 0, to: view.state.doc.length, insert: content },
                        });
                    } catch (err: any) {
                        if (err.toString().indexOf('No data available') > -1) {
                            continue;
                        }
                        console.error("Failed to sync file changes", err);
                    }
                }
            } catch (err: any) {
                if (err.name === 'AbortError') return;
                throw err;
            }
        })();
    };

    // Get language support based on file path
    const getLanguageSupport = async (filePath: string) => {
        try {
            return await getLanguageSupportForFile(filePath);
        } catch (error) {
            console.error("Failed to get language support:", error);
            return null;
        }
    };

    // Detect indentation based on file content
    const getIndentationUnit = (content: string) => {
        return detectIndentationUnit(content) || '    ';
    };

    // Create TypeScript environment
    const createTSEnvironment = async (filePath: string, content: string) => {
        try {
            const compilerOptions = ts.getDefaultCompilerOptions();
            const fileMap = await createDefaultMapFromCDN(compilerOptions, '5.7.3', true, ts, lzstring);

            // Use the actual file path as the key in the file map
            const fileName = filePath.split('/').pop() || 'example.ts';
            fileMap.set(fileName, content);

            const system = createSystem(fileMap);
            return createVirtualTypeScriptEnvironment(system, [fileName], ts, compilerOptions);
        } catch (error) {
            console.error("Failed to create TypeScript environment:", error);
            return null;
        }
    };

    // Initial setup - with composed transactions
    setTimeout(async () => {
        if (initialized) return;
        initialized = true;
        console.log('initializing');

        try {
            // Step 1: Read the file content
            const content = await fs.readFile(path);
            console.log('read file content', content);

            // Step 2: Get all the necessary extensions and effects in parallel
            const [languageSupport] = await Promise.all([
                getLanguageSupport(path),
                createTSEnvironment(path, content)
            ]);

            const unit = getIndentationUnit(content);

            // Step 3: Compose all changes into a single transaction
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: content },
                effects: [
                    // Language support
                    languageCompartment.reconfigure(languageSupport || []),
                    // Indentation
                    indentationCompartment.reconfigure(indentUnit.of(unit)),
                ].filter(Boolean) // Filter out null effects
            });

            console.log('applied all initial settings');

            // Start watching for file changes after the state is set up
            startWatching();
            console.log('after watch call');
        } catch (error) {
            console.error("Failed to initialize codeblock:", error);
        }
    }, 0);

    return {
        update(update: ViewUpdate) {
            const oldConfig = update.startState.facet(CodeblockFacet);
            const newConfig = update.state.facet(CodeblockFacet);

            console.log('in view update', oldConfig, newConfig);

            // Handle path changes
            if (oldConfig.path !== newConfig.path) {
                ({ fs, path } = newConfig);

                // Path change requires reading the new file and updating multiple settings
                fs.readFile(path).then(async content => {
                    // Get all the necessary extensions and effects in parallel
                    const [languageSupport, _] = await Promise.all([
                        getLanguageSupport(path),
                        createTSEnvironment(path, content)
                    ]);

                    const unit = getIndentationUnit(content);

                    // Compose all changes into a single transaction
                    view.dispatch({
                        changes: { from: 0, to: view.state.doc.length, insert: content },
                        effects: [
                            languageCompartment.reconfigure(languageSupport || []),
                            indentationCompartment.reconfigure(indentUnit.of(unit)),
                        ]
                    });

                    // Restart watcher for new path
                    startWatching();
                }).catch(console.error);
            }

            // Handle document changes for saving
            if (update.docChanged && oldConfig.path === newConfig.path) {
                save();
                // const content = update.state.doc.toString();

                // (async () => {
                //     const _ = await createTSEnvironment(path, content);
                //     const unit = getIndentationUnit(content);

                //     view.dispatch({
                //         effects: [
                //             indentationCompartment.reconfigure(indentUnit.of(unit)),
                //         ].filter(Boolean)
                //     });
                // })();
            }
        },
        destroy() {
            console.log('Destroying codeblock view plugin');
            abortController.abort(); // Stop the watcher
        }
    };
});

// Simplified API for creating a codeblock
export function createCodeblock(parent: HTMLElement, fs: FS, path: string, toolbar = true) {
    const state = EditorState.create({
        doc: "",  // Will be populated reactively
        extensions: [
            basicSetup,
            codeblock({ fs, path, toolbar })
        ]
    });

    return new EditorView({ state, parent });
}