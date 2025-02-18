import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import { debounce } from "lodash";

interface FS {
    readFile: (path: string, encoding: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
    watch: (path: string, callback: () => void) => { close: () => void };
    mkdir?: (path: string) => Promise<void>;
}

function fileSystemExtension(path: string, fs: FS) {
    return (view: EditorView) => {
        let updatingFromFS = false;

        fs.readFile(path, "utf-8").then((content) => {
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: content },
            });
        }).catch(console.error);

        const save = debounce(async () => {
            if (updatingFromFS) return;
            const content = view.state.doc.toString();
            await fs.writeFile(path, content).catch(console.error);
        }, 500);

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
            update(update: any) {
                if (update.docChanged) save();
            },
            destroy() {
                watcher.close();
            },
        };
    };
}

class CodeEditor extends HTMLElement {
    private editorView?: EditorView;
    private toolbarInput?: HTMLInputElement;
    private fs!: FS;
    private path!: string;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        this.path = this.getAttribute("file-path") || "untitled.txt";
        //this.fs = (window as any).fs; // Assume FS is globally available or set externally.
        this.fs = {
            readFile: async (path) => "// Initial file content",
            writeFile: async (path, content) => console.log("Saving:", path, content),
            watch: (path, callback) => ({ close: () => console.log("Stopped watching", path) })
        }

        if (!this.fs) {
            console.error("No filesystem provided.");
            return;
        }

        this.render();
    }

    private async render() {
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
                .toolbar {
                    width: 100%;
                    padding: 4px;
                    background: #f8f9fa;
                    border-bottom: 1px solid #ccc;
                    display: flex;
                    align-items: center;
                }
                .toolbar input {
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
                <div class="toolbar">
                    <input type="text" value="${this.path}" />
                </div>
                <div class="editor"></div>
            </div>
        `;

        this.toolbarInput = this.shadowRoot.querySelector(".toolbar input") as HTMLInputElement;
        const editorContainer = this.shadowRoot.querySelector(".editor") as HTMLDivElement;

        const state = EditorState.create({
            extensions: [basicSetup, ViewPlugin.define(fileSystemExtension(this.path, this.fs))],
        });

        this.editorView = new EditorView({
            state,
            parent: editorContainer,
        });

        this.toolbarInput.addEventListener("input", (event) => {
            this.path = (event.target as HTMLInputElement).value;
        });
    }

    disconnectedCallback() {
        this.editorView?.destroy();
    }
}

customElements.define("code-editor", CodeEditor);
