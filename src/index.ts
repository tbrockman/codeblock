import { configureSingle, promises as fs } from "@zenfs/core";
import { createCodeblock } from "./editor";
import { WebAccess } from "@zenfs/dom";
import { FS } from "./fs";

await configureSingle({ backend: WebAccess, handle: await navigator.storage.getDirectory() })

const editorContainer = document.getElementById('editor') as HTMLDivElement;

const fsImpl: FS = {
    async readFile(path: string) {
        return fs.readFile(path, { encoding: 'utf-8' });
    },
    async writeFile(path: string, data: string) {
        console.log('writing file', path, data)
        return fs.writeFile(path, data);
    },
    async *watch(path: string, options: { signal: AbortSignal }) {
        for await (const e of fs.watch(path, { signal: options.signal, encoding: 'utf-8', recursive: true })) {
            yield e as { eventType: 'rename' | 'change', filename: string };
        }
    },
    async mkdir(path: string, options: { recursive: boolean }) {
        await fs.mkdir(path, options);
    },
    async exists(path: string) {
        return fs.exists(path);
    }
};

const file = await fs.readFile('example.ts', 'utf-8');
console.log('have file', file)
const editorView = createCodeblock(editorContainer, fsImpl, 'example.ts');