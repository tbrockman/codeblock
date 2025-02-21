import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState, Facet } from "@codemirror/state";
import { ViewPlugin, ViewUpdate, keymap, KeyBinding } from "@codemirror/view";
import { debounce } from "lodash";
import { codeblockTheme } from "./theme";
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
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

const navigationKeymap: KeyBinding[] = [{
    key: "ArrowUp",
    run: (view: EditorView) => {
        const cursor = view.state.selection.main;
        const line = view.state.doc.lineAt(cursor.head);
        const toolbarInput = view.dom.querySelector<HTMLElement>('.cm-toolbar-input')

        // Only handle up arrow if we're on the first line
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
        CodeblockViewPlugin,
        keymap.of(navigationKeymap)
    ]
}

const CodeblockViewPlugin = ViewPlugin.define((view: EditorView) => {
    let { fs, path, toolbar } = view.state.facet(CodeblockFacet);
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

    let toolbarElement: HTMLElement | null = null;
    let toolbarInput: HTMLInputElement | null = null;

    // TODO: replace toolbar with a CodeMirror Panel: https://codemirror.net/examples/panel/

    if (toolbar) {
        toolbarElement = document.createElement("div");
        toolbarElement.className = "cm-toolbar";
        toolbarInput = document.createElement("input");
        toolbarInput.type = "text";
        toolbarInput.value = path;
        toolbarInput.className = "cm-toolbar-input";
        toolbarElement.appendChild(toolbarInput);
        view.dom.prepend(toolbarElement);

        // Handle filename input events
        toolbarInput.addEventListener("input", async (event) => {
            path = (event.target as HTMLInputElement).value;
            const language = await getLanguageSupportForFile(path);
            view.dispatch({
                effects: [
                    compartment.reconfigure(CodeblockFacet.of({ fs, path, toolbar })),
                    languageCompartment.reconfigure(language || [])
                ]
            });
        });

        // Add down arrow handler for filename input
        toolbarInput.addEventListener("keydown", (event) => {
            if (event.key === "ArrowDown") {
                event.preventDefault();
                view.focus();
                view.dispatch({
                    selection: { anchor: 0, head: 0 }
                });
                // Not entirely sure why this is necessary, presumably because we didn't use a Panel
                view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
            }
        });
    }

    return {
        update(update: ViewUpdate) {
            ({ fs, path, toolbar } = update.state.facet(CodeblockFacet));
            if (update.docChanged) save();
        },
        destroy() {
            abort();
            toolbarElement?.remove();
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
            // vscodeLight,
            keymap.of([indentWithTab]),
            codeblockTheme
        ]
    });
    return new EditorView({ state, parent });
}

const editorContainer = document.getElementById('editor') as HTMLDivElement;
const editorView = createCodeblock(editorContainer, window.fs, 'example.ts');