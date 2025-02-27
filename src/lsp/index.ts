import type { LanguageSupport } from '@codemirror/language';
import { GetLanguageEnvArgs } from "../types";
import { LanguageServer } from '@volar/language-server';

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

const languageServerCache: Record<string, LanguageServer> = {};
const languageServerFactory: Record<string, () => Promise<LanguageServer>> = {
    javascript: async () => {

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

const createLanguageEnvironment = async ({ language }: GetLanguageEnvArgs) => {
    if (languageServerCache[language]) {
        return languageServerCache[language];
    }
    const loader = languageServerFactory[language];
    if (!loader) return null;

    const env = await loader();
    languageServerCache[language] = env;
    return env;
}