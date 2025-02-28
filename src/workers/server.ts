import * as Comlink from 'comlink';
import { createLanguageServer, CreateLanguageServerArgs } from '../lsp';
import { createConnection } from 'vscode-languageserver/browser';
import { BrowserMessageReader, BrowserMessageWriter, InitializeRequest, InitializeResult, TextDocumentSyncKind } from '@volar/language-server/browser';

onconnect = async (event) => {
    const port = event.ports[0];
    console.log('LSP worker connected on port: ', port);

    const proxy = async ({ language, fs }: Omit<CreateLanguageServerArgs, 'connection'>) => {
        const test = await fs.exists('/');
        console.log('test', test);
        const reader = new BrowserMessageReader(port);
        const writer = new BrowserMessageWriter(port);
        const connection = createConnection(reader, writer);
        console.log('created connection', connection)
        await createLanguageServer({ language, fs, connection });
        console.log('created language server')
        connection.onRequest(InitializeRequest.type, (_params): InitializeResult => {
            console.log('have request???')
            return {
                capabilities: {
                    textDocumentSync: TextDocumentSyncKind.Incremental,
                    hoverProvider: true,
                },
            };
        });
        connection.listen();
        console.log('listening')
        // connection.sendRequest(InitializeRequest.type, { processId: null, rootUri: null, capabilities: {} })
        return null;
    }

    Comlink.expose({ createLanguageServer: proxy }, port);
}
