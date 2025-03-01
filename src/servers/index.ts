import type { LanguageSupport } from '@codemirror/language';
import { FS } from "../types";
import { Connection, LanguageServer } from '@volar/language-server';
import { createLanguageServer as createTypescriptServer } from './typescript';

const languageSupportCache: Record<string, LanguageSupport> = {};
const languageSupportMap: Record<string, () => Promise<LanguageSupport>> = {
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

export const getLanguageSupport = async (language: string) => {
    if (languageSupportCache[language]) {
        return languageSupportCache[language];
    }

    const loader = languageSupportMap[language];
    if (!loader) return null;

    const support = await loader();
    languageSupportCache[language] = support;
    return support;
}

export type LanguageServerArgs = {
    connection: Connection
    fs: FS
}
export type LanguageServerProvider = (args: LanguageServerArgs) => Promise<LanguageServer>;
const languageServerCache: Record<string, LanguageServer> = {};
const languageServerFactory: Record<string, LanguageServerProvider> = {
    javascript: async (args) => {
        console.log('before create')
        return createTypescriptServer(args)
    },
    // python: async () => {
    //     const { createLanguageService } = await import('pyright-internal');
    //     return createLanguageService();
    // },
    // rust: async () => {
    //     const { createLanguageService } = await import('rust-analyzer');
    //     return createLanguageService();
    // },
    // Add more languages as needed
}

export type CreateLanguageServerArgs = {
    language: string
} & LanguageServerArgs

export const createLanguageServer = async ({ language: lang, fs, connection }: CreateLanguageServerArgs) => {
    let language = await lang;
    if (languageServerCache[language]) {
        return languageServerCache[language];
    }
    const loader = languageServerFactory[language];
    if (!loader) return null;

    const env = await loader({ fs, connection });
    languageServerCache[language] = env;
    return env;
}