import type { promises as fs } from "@zenfs/core";
import { createCodeblock } from "./editor";
import { FS } from "./types";
import * as Comlink from 'comlink';
import { watchOptionsTransferHandler, asyncGeneratorTransferHandler } from './rpc/serde';

Comlink.transferHandlers.set('asyncGenerator', asyncGeneratorTransferHandler)
Comlink.transferHandlers.set('watchOptions', watchOptionsTransferHandler)

const fsWorker = new SharedWorker(new URL('./workers/fs.ts', import.meta.url), { type: 'module' });
const fsInterface = Comlink.wrap<typeof fs>(fsWorker.port);

const editorContainer = document.getElementById('editor') as HTMLDivElement;

const fsImpl: FS = {
    async readFile(path: string) {
        return fsInterface.readFile(path, { encoding: 'utf-8' }) as Promise<string>;
    },
    async writeFile(path: string, data: string) {
        return fsInterface.writeFile(path, data, { encoding: 'utf-8' });
    },
    async *watch(path: string, { signal }) {
        for await (const e of await fsInterface.watch(path, { signal, encoding: 'utf-8', recursive: true })) {
            yield e as { eventType: 'rename' | 'change', filename: string };
        }
    },
    async mkdir(path: string, options: { recursive: boolean }) {
        await fsInterface.mkdir(path, options);
    },
    async exists(path: string) {
        return fsInterface.exists(path);
    }
};

createCodeblock({ parent: editorContainer, fs: fsImpl, path: 'example.ts', toolbar: true });