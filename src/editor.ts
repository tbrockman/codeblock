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
import { FS } from "./fs";

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
        console.log('save called', path, updatingFromFS, view.state.doc.toString())
        await fs.writeFile(path, view.state.doc.toString()).catch(console.error);
        const diskFile = await fs.readFile(path);
        console.log('disk file', diskFile)
    }, 500);

    (async () => {
        try {
            for await (const e of fs.watch('/' + path, { signal })) {
                console.log('file changed', e)
                updatingFromFS = true;
                try {
                    const content = await fs.readFile(path);
                    if (content === view.state.doc.toString()) return;
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
    const doc = await fs.readFile(path);
    const unit = detectIndentationUnit(doc) || '    ';
    const state = EditorState.create({
        doc,
        extensions: [
            basicSetup,
            codeblock({ fs, path, toolbar }),
            languageCompartment.of(language || []),
            vscodeDark,
            indentUnit.of(unit),
            keymap.of([indentWithTab]),
            codeblockTheme,
        ]
    });

    return new EditorView({ state, parent });
}