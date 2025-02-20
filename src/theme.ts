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
    },
    '.cm-toolbar': {
        padding: '0 8px',
        background: '#27313d',
        display: 'flex',
        alignItems: 'center'
    }
})