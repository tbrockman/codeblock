import type { LanguageSupport } from '@codemirror/language';

const languageSupportCache: Record<string, LanguageSupport> = {};

const languageSupport: Record<string, () => Promise<LanguageSupport>> = {
    javascript: async () => {
        const { javascript } = await import('@codemirror/lang-javascript');
        return javascript({ jsx: true, typescript: true });
    },
    python: async () => {
        const { python } = await import('@codemirror/lang-python');
        return python();
    },
    rust: async () => {
        const { rust } = await import('@codemirror/lang-rust');
        return rust();
    },
    // Add more languages as needed
};

const extToLanguageMap: Record<string, string> = {
    js: 'javascript',
    ts: 'javascript',
    jsx: 'javascript',
    tsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    php: 'php',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    go: 'go',
    swift: 'swift',
    kt: 'kotlin',
    rs: 'rust',
    scala: 'scala',
    m: 'objectivec',
    vb: 'vb',
    hs: 'haskell',
    lua: 'lua',
    pl: 'perl',
    sh: 'bash',
    sql: 'sql',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    xml: 'xml',
    md: 'markdown',
    toml: 'toml',
    ini: 'ini',
    conf: 'ini',
    log: 'ini',
    env: 'ini',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    dockerignore: 'gitignore',
    gitignore: 'gitignore',
};

export async function getLanguageSupportForFile(path: string) {
    const ext = path.split('.').pop()?.toLowerCase();
    if (!ext) return null;

    const language = extToLanguageMap[ext];
    if (!language) return null;

    if (languageSupportCache[language]) {
        return languageSupportCache[language];
    }

    const loader = languageSupport[language];
    if (!loader) return null;

    const support = await loader();
    languageSupportCache[language] = support;
    return support;
}
