import { FileSystem, FileType, ProviderResult } from '@volar/language-service';
import { create as createTypeScriptServicePlugins } from 'volar-service-typescript'
import { FS } from '../types';
import { URI } from 'vscode-uri'
import { Connection, createServerBase, createTypeScriptProject } from '@volar/language-server/browser';
import ts from 'typescript';

// Credit: https://github.com/mdx-js/mdx-analyzer/blob/4bb0a8784f6f0bcf2a0b07cd7084989060828b8b/packages/language-server/lib/index.js#L62

export class VolarFS implements FileSystem {
    #fs: FS

    constructor(fs: FS) {
        this.#fs = fs
    }

    stat(uri: URI): ProviderResult<any | undefined> {
        return this.#fs.stat(uri.path);
    }
    readDirectory(uri: URI): ProviderResult<[string, FileType][]> {
        return this.#fs.readDir(uri.path);
    }
    readFile(uri: URI, encoding?: string): ProviderResult<string | undefined> {
        return this.#fs.readFile(uri.path);
    }
}


function getLanguageServicePlugins(_ts: typeof ts) {
    const plugins = [
        ...createTypeScriptServicePlugins(_ts),
        // ...more?
    ]
    return plugins
}

/**
   * @param {string | undefined} tsconfigPath
   */
async function getLanguagePlugins(tsconfigPath: string, cwd: string) {
    let plugins: never[] = []
    return plugins;
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
    console.log('have server', server)
    server.fileSystem.install('file', new VolarFS(fs));
    server.onInitialize((params) => {
        console.log('server on init', params)
    })
    connection.onInitialize(async (params) => {
        const languageServicePlugins = getLanguageServicePlugins(ts)
        console.log('language service', languageServicePlugins)

        return server.initialize(
            params,
            createTypeScriptProject(
                ts,
                undefined,
                async ({ configFileName }) => ({
                    languagePlugins: await getLanguagePlugins(configFileName || 'tsconfig.json', '/')
                })
            ),
            languageServicePlugins
        )
    })
    connection.onInitialized(() => {
        const extensions = [
            '.tsx',
            '.jsx',
            '.js',
            '.ts'
        ]
        server.fileWatcher.watchFiles([`**/*.{${extensions.join(',')}}`])
        server.initialized();
    });
    console.log('creating simple project?')
    // server.initialize({ processId: null, rootUri: null, capabilities: {} }, project, [])
    console.log('setting up server')
    // debugger;
    // project.setup(server);
    // console.log('created project', project)
    return server;
}