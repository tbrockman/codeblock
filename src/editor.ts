import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState, Facet } from "@codemirror/state";
import { ViewPlugin, ViewUpdate, keymap, KeyBinding, Panel, showPanel } from "@codemirror/view";
import { debounce } from "lodash";
import { codeblockTheme } from "./theme";
import { vscodeDark, } from '@uiw/codemirror-theme-vscode';
import { getLanguageSupportForFile } from "./language";
import { indentWithTab } from "@codemirror/commands";
import { detectIndentationUnit } from "./utils";
import { indentUnit } from "@codemirror/language";

declare global {
    interface Window {
        fs: FS;
    }
}

(window as any).fs = {
    readFile: async (path) => `export function createCodeblock(parent: HTMLElement, fs: FS, path: string, toolbar = true) {
    const state = EditorState.create({
        extensions: [
            basicSetup,
            codeblock({ fs, path, toolbar }),
            vscodeDark,
            // vscodeLight,
            codeblockTheme
        ]
    });
    return new EditorView({ state, parent });
}
    `
    ,
    writeFile: async (path, content) => console.log("Saving:", path, content),
    watch: (path, options) => {
        return {
            [Symbol.asyncIterator]() {
                let firstCall = true;
                return {
                    async next() {
                        if (firstCall) {
                            firstCall = false;
                            return {
                                done: false,
                                value: { eventType: 'change', filename: 'test.txt' }
                            };
                        }
                        // Block forever after first element
                        return new Promise(() => { });
                    }
                };
            }
        };
    },
    mkdir: (path: string, options: { recursive: boolean }) => Promise.resolve(),
    exists: (path: string) => Promise.resolve(true),
} as FS;

interface FS {
    /**
     * Reads the entire contents of a file asynchronously
     * @param path A path to a file
     */
    readFile: (
        path: string,
    ) => Promise<string>;

    /**
     * Writes data to a file asynchronously
     * @param path A path to a file
     * @param data The data to write
     */
    writeFile: (
        path: string,
        data: string,
    ) => Promise<void>;

    /**
     * Watch for changes to a file or directory
     * @param path A path to a file/directory
     * @param options Configuration options for watching
     */
    watch: (
        path: string,
        options: {
            signal: AbortSignal,
        }
    ) => AsyncIterable<{ eventType: 'rename' | 'change', filename: string }>;

    /**
     * Creates a directory asynchronously
     * @param path A path to a directory, URL, or parent FileSystemDirectoryHandle
     * @param options Configuration options for directory creation
     */
    mkdir: (
        path: string,
        options: {
            recursive: boolean,
        }
    ) => Promise<void>;

    /**
     * Checks whether a given file or folder exists
     * @param path A path to a file or folder
     * @returns A promise that resolves to true if the file or folder exists, false otherwise
     */
    exists: (
        path: string,
    ) => Promise<boolean>;
}

type CodeblockConfig = { fs: FS; path: string; toolbar: boolean };
const CodeblockFacet = Facet.define<CodeblockConfig, CodeblockConfig>({
    combine: (values) => values[0]
});
const compartment = new Compartment();
const languageCompartment = new Compartment();

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
    input.addEventListener("input", async (event) => {
        const newPath = (event.target as HTMLInputElement).value;
        // Update the path in the facet immediately
        view.dispatch({
            effects: compartment.reconfigure(CodeblockFacet.of({
                ...view.state.facet(CodeblockFacet),
                path: newPath
            }))
        })
        // Update the language support for the new path
        const language = await getLanguageSupportForFile(newPath);
        view.dispatch({
            effects: languageCompartment.reconfigure(language || [])
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
            // this is required for some reason?
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

const codeblock = ({ fs, path, toolbar }: CodeblockConfig) => {
    return [
        compartment.of(CodeblockFacet.of({ fs, path, toolbar })),
        toolbar ? showPanel.of(toolbarPanel) : [],
        CodeblockViewPlugin,
        keymap.of(navigationKeymap)
    ];
};

const CodeblockViewPlugin = ViewPlugin.define((view: EditorView) => {
    let { fs, path } = view.state.facet(CodeblockFacet);
    let { signal, abort } = new AbortController();
    let updatingFromFS = false;

    const save = debounce(async () => {
        if (updatingFromFS) return;
        await fs.writeFile(path, view.state.doc.toString()).catch(console.error);
    }, 500);

    (async () => {
        try {
            for await (const _ of fs.watch(path, { signal })) {
                updatingFromFS = true;
                try {
                    const content = await fs.readFile(path);
                    view.dispatch({
                        changes: { from: 0, to: view.state.doc.length, insert: content },
                    });
                } catch (err) {
                    console.error("Failed to sync file changes", err);
                }
                updatingFromFS = false;
            }
        } catch (err: any) {
            if (err.name === 'AbortError') return;
            throw err;
        }
    })();

    return {
        update(update: ViewUpdate) {
            ({ fs, path } = update.state.facet(CodeblockFacet));
            if (update.docChanged) save();
        },
        destroy() {
            abort();
        }
    };
});

export async function createCodeblock(parent: HTMLElement, fs: FS, path: string, toolbar = true) {
    const language = await getLanguageSupportForFile(path);
    const file = await fs.readFile(path);
    const unit = detectIndentationUnit(file) || '    ';
    const state = EditorState.create({
        doc: '',
        extensions: [
            basicSetup,
            codeblock({ fs, path, toolbar }),
            languageCompartment.of(language || []),
            vscodeDark,
            indentUnit.of(unit),
            keymap.of([indentWithTab]),
            codeblockTheme
        ]
    });

    return new EditorView({ state, parent });
}