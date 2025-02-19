import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState, Facet } from "@codemirror/state";
import { ViewPlugin, ViewUpdate } from "@codemirror/view";
import { debounce } from "lodash";

(window as any).fs = {
    readFile: async (path) => "// Initial file content",
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

const codeblock = ({ fs, path, toolbar }: CodeblockConfig) => {
    return [
        compartment.of(CodeblockFacet.of({ fs, path, toolbar })),
        CodeblockViewPlugin
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
    if (toolbar) {
        toolbarElement = document.createElement("div");
        toolbarElement.className = "cm-toolbar";
        const input = document.createElement("input");
        input.type = "text";
        input.value = path;
        input.className = "cm-toolbar-input";
        toolbarElement.appendChild(input);
        view.dom.parentElement?.insertBefore(toolbarElement, view.dom);
        input.addEventListener("input", (event) => {
            path = (event.target as HTMLInputElement).value;
            view.dispatch({ effects: compartment.reconfigure(CodeblockFacet.of({ fs, path, toolbar })) });
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

export function createCodeblock(parent: HTMLElement, fs: FS, path: string, toolbar = true) {
    const state = EditorState.create({
        extensions: [
            basicSetup,
            codeblock({ fs, path, toolbar }),
        ]
    });
    return new EditorView({ state, parent });
}

class CodeEditor extends HTMLElement {
    private editorView?: EditorView;
    private fs: FS | null = null;
    private path: string | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        this.path = this.getAttribute("file-path") || null;
        this.fs = (window as any).fs || null;

        if (!this.fs) {
            console.error("No filesystem provided.");
            return;
        }

        this.render();
    }

    private render() {
        if (!this.shadowRoot) return;

        this.shadowRoot.innerHTML = `
            <style>
                .editor-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    overflow: hidden;
                }
                .cm-toolbar {
                    width: 100%;
                    padding: 4px;
                    background: #f8f9fa;
                    border-bottom: 1px solid #ccc;
                    display: flex;
                    align-items: center;
                }
                .cm-toolbar-input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    font-size: 14px;
                    outline: none;
                    padding: 4px;
                }
                .editor {
                    flex: 1;
                }
            </style>
            <div class="editor-container">
                <div class="editor"></div>
            </div>
        `;

        const editorContainer = this.shadowRoot.querySelector(".editor") as HTMLDivElement;

        this.editorView = createCodeblock(editorContainer, this.fs!, this.path!);
    }

    disconnectedCallback() {
        this.editorView?.destroy();
    }
}

customElements.define("code-editor", CodeEditor);