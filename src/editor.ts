import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState, Facet, FacetReader, StateField } from "@codemirror/state";
import { ViewPlugin, ViewUpdate } from "@codemirror/view";
import { debounce } from "lodash";

(window as any).fs = {
    // @ts-ignore
    readFile: async (path) => "// Initial file content",
    // @ts-ignore
    writeFile: async (path, content) => console.log("Saving:", path, content),
    // @ts-ignore
    watch: (path, callback) => ({ close: () => console.log("Stopped watching", path) })
};

interface FS {
    readFile: (path: string, encoding: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
    watch: (path: string, callback: () => void) => { close: () => void };
    mkdir?: (path: string) => Promise<void>;
}

/** Facet for configuring the file system and path */
const FileSystemFacet = Facet.define<{ fs: FS; path: string }, { fs: FS; path: string }>({
    combine: (values) => values[0] ?? { fs: null as any, path: "untitled.txt" }
});

const compartment = new Compartment();

/** State field to hold the current file content */
const FileContentField = StateField.define<string>({
    create(state) {
        return ""
        // const { fs, path } = state.facet(FileConfigFacet);
        // return fs.readFile(path, "utf-8").catch(() => "").then((content) => content);
    },
    update(value, transaction) {
        if (transaction.docChanged) return transaction.newDoc.toString();
        return value;
    }
});

/** View plugin to handle file system synchronization */
const FileSyncPlugin = ViewPlugin.define((view: EditorView) => {
    let { fs, path } = view.state.facet(FileSystemFacet);
    let updatingFromFS = false;

    // Debounced save function
    const save = debounce(async () => {
        if (updatingFromFS) return;
        const content = view.state.field(FileContentField);
        await fs.writeFile(path, content).catch(console.error);
    }, 500);

    // Sync external file changes
    const watcher = fs.watch(path, async () => {
        updatingFromFS = true;
        try {
            const content = await fs.readFile(path, "utf-8");
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: content },
            });
        } catch (err) {
            console.error("Failed to sync file changes", err);
        }
        updatingFromFS = false;
    });

    return {
        update(update: ViewUpdate) {
            // @ts-expect-error
            ({ path, fs } = compartment.get(update.state)?.value);
            if (update.docChanged) save();
        },
        destroy() {
            watcher.close();
        }
    };
});

/** View plugin to create the toolbar */
const ToolbarPlugin = ViewPlugin.define((view: EditorView) => {
    let { path, fs } = view.state.facet(FileSystemFacet);
    const toolbar = document.createElement("div");
    toolbar.className = "cm-toolbar";

    const input = document.createElement("input");
    input.type = "text";
    input.value = path;
    input.className = "cm-toolbar-input";

    toolbar.appendChild(input);
    view.dom.parentElement?.insertBefore(toolbar, view.dom);

    input.addEventListener("input", (event) => {
        path = (event.target as HTMLInputElement).value;
        view.dispatch({ effects: compartment.reconfigure(FileSystemFacet.of({ path, fs })) });
    });

    return {
        destroy() {
            toolbar.remove();
        }
    };
});

/** Utility function to create a configured CodeMirror instance */
export function createCodeEditor(parent: HTMLElement, fs: FS, path: string) {
    const state = EditorState.create({
        extensions: [
            basicSetup,
            compartment.of(FileSystemFacet.of({ fs, path })),
            FileContentField,
            FileSyncPlugin,
            ToolbarPlugin
        ]
    });

    return new EditorView({ state, parent });
}

/** Web component that uses the createCodeEditor utility */
class CodeEditor extends HTMLElement {
    private editorView?: EditorView;
    private fs!: FS;
    private path!: string;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        this.path = this.getAttribute("file-path") || "untitled.txt";
        this.fs = (window as any).fs;

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

        this.editorView = createCodeEditor(editorContainer, this.fs, this.path);
    }

    disconnectedCallback() {
        this.editorView?.destroy();
    }
}

customElements.define("code-editor", CodeEditor);
