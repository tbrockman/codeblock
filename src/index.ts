import type { Dirent, promises as fs, Stats } from "@zenfs/core";
import { createCodeblock } from "./editor";
import { FS } from "./types";
import * as Comlink from 'comlink';
import { watchOptionsTransferHandler, asyncGeneratorTransferHandler } from './rpc/serde';
import { FileStat, FileType } from "@volar/language-service";
import { fsbuffer } from 'virtual:@jsnix/snapshot';

console.log('have fsbuffer', fsbuffer)

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
    async readDir(path: string) {
        const files = await fsInterface.readdir(path, { withFileTypes: true, encoding: 'utf-8' }) as Dirent[];
        console.log('files from readDir', files)
        // TODO: due to serialization, files are not Dirent[]
        return files.reduce((acc: [string, FileType][], ent: Dirent) => {
            // TODO: handle folder and symlink properly
            let type = FileType.File;
            // @ts-expect-error
            switch ((ent.stats.mode as number) & 0o170000) {
                case 0o040000:
                    type = FileType.Directory;
                    break;
                case 0o120000:
                    type = FileType.SymbolicLink;
                    break;
            }
            acc.push([ent.path, type]);
            return acc;
        }, [] as [string, FileType][]);
    },
    async exists(path: string) {
        return fsInterface.exists(path);
    },
    async stat(path: string) {
        const stat = await fsInterface.stat(path)
        console.log('in stat with path', path, stat)
        // TODO: handle folder and symlink properly
        let type = FileType.File;

        switch ((stat.mode as number) & 0o170000) {
            case 0o040000:
                type = FileType.Directory;
                break;
            case 0o120000:
                type = FileType.SymbolicLink;
                break;
        }

        return {
            name: path,
            mtime: 0,
            ctime: 0,
            size: stat.size,
            type
        } as FileStat;
    },
};

createCodeblock({ parent: editorContainer, fs: fsImpl, path: 'example.ts', toolbar: true });