import { FileStat, FileSystem, FileType, ProviderResult } from '@volar/language-service';
import { FS } from '../types';
import { URI } from 'vscode-uri'
import { Connection, createServerBase } from '@volar/language-server/browser';

export class VolarFS implements FileSystem {
    #fs: FS

    constructor(fs: FS) {
        this.#fs = fs
    }

    stat(uri: URI): ProviderResult<FileStat | undefined> {
        return this.#fs.stat(uri.path);
    }
    readDirectory(uri: URI): ProviderResult<[string, FileType][]> {
        return this.#fs.readDir(uri.path);
    }
    readFile(uri: URI, encoding?: string): ProviderResult<string | undefined> {
        return this.#fs.readFile(uri.path);
    }
}

export type CreateTypescriptEnvironmentArgs = {
    connection: Connection
    fs: FS
}

export const createLanguageServer = ({ connection, fs }: CreateTypescriptEnvironmentArgs) => {
    console.log('creating language server', connection, fs)
    const server = createServerBase(connection, {
        timer: {
            setImmediate: (callback: (...args: any[]) => void, ...args: any[]) => {
                setTimeout(callback, 0, ...args);
            },
        },
    });
    server.fileSystem.install('file', new VolarFS(fs));
    return server;
}