import { configure, configureSingle, fs } from "@zenfs/core";
import { createCodeblock } from "./editor";
import { WebAccess } from "@zenfs/dom";

await configureSingle({ backend: WebAccess, handle: await navigator.storage.getDirectory() })

const editorContainer = document.getElementById('editor') as HTMLDivElement;

const fsImpl = {
    async readFile(path: string) {
        return new Promise<string>((resolve, reject) => {
            fs.readFile(path, (err, data) => {
                if (err) reject(err);
                else resolve(data?.toString() || '');
            });
        })
    },
    async writeFile(path: string, data: string) {
        return fs.writeFile(path, data);
    },
    watch(path: string) {
        return fs.watch(path);
    },
    mkdir(path: string) {
        return fs.mkdir(path);
    },
    exists(path: string) {
        return fs.exists(path);
    }
}

fs.writeFile('example.ts', 'console.log("Hello World!")');
const editorView = createCodeblock(editorContainer, fsImpl, 'example.ts');