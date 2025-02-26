import { createDefaultMapFromCDN, createSystem, createVirtualTypeScriptEnvironment } from "@typescript/vfs";
import ts, { LanguageService } from "typescript";
import * as lzstring from 'lz-string';
import * as Comlink from 'comlink';
import { GetLanguageEnvArgs, VirtualLanguageEnvironment } from "../types";
import { BrowserMessageReader, BrowserMessageWriter, createProtocolConnection } from "vscode-languageserver-protocol/browser";
// import { createServerBase } from '@volar/language-server/browser'

const languageEnvCache: Record<string, VirtualLanguageEnvironment> = {};
const languageEnvFactory: Record<string, () => Promise<VirtualLanguageEnvironment>> = {
    javascript: async () => {
        const compilerOptions = ts.getDefaultCompilerOptions();
        const fileMap = await createDefaultMapFromCDN(compilerOptions, '5.7.3', false, ts, lzstring);
        const system = createSystem(fileMap);
        // TODO: addAllFilesFromFolder(map, "node_modules/@types")
        // 1. Need to create method allowing users to upload their own fs
        //    Let's not worry about allowing users to install packages in the browser yet
        // 2. Need method to export code
        // 3. Need method to execute code
        const env = createVirtualTypeScriptEnvironment(system, [], ts, compilerOptions);
        return Comlink.proxy<VirtualLanguageEnvironment>({ ...env, languageService: Comlink.proxy(env.languageService) as LanguageService & Comlink.ProxyMarked });
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
    if (languageEnvCache[language]) {
        return languageEnvCache[language];
    }
    const loader = languageEnvFactory[language];
    if (!loader) return null;

    const env = await loader();
    languageEnvCache[language] = env;
    return env;
}

onconnect = async (event) => {
    const port = event.ports[0];
    console.log('LSP worker connected on port: ', port);
    Comlink.expose({ createLanguageEnvironment }, port);
}
const worker: Worker = self as any;
const conn = createProtocolConnection(
    new BrowserMessageReader(worker),
    new BrowserMessageWriter(worker),
);
conn.listen();