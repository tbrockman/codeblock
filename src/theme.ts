import { EditorView } from "codemirror";

export const codeblockTheme = EditorView.theme({
    '.cm-toolbar-input': {
        fontFamily: 'monospace',
        lineHeight: 1.4,
        flex: 1,
        border: 'none',
        background: 'transparent',
        outline: 'none',
        fontSize: '16px',
        color: 'white',
        padding: '0 0 0 14px'
    },
    '.cm-toolbar-panel': {
        padding: '0',
        background: '#27313d',
        display: 'flex',
        alignItems: 'center'
    },
    '.cm-content': {
        padding: 0
    }
})