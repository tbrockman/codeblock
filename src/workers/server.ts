import * as Comlink from 'comlink';
import { createLanguageServer, CreateLanguageServerArgs } from '../servers';
import { createConnection } from 'vscode-languageserver/browser';
import { BrowserMessageReader, BrowserMessageWriter } from '@volar/language-server/browser';

onconnect = async (event) => {
    const port = event.ports[0];
    console.log('LSP worker connected on port: ', port);

    const proxy = async ({ language, fs }: Omit<CreateLanguageServerArgs, 'connection'>) => {
        const test = await fs.exists('/');
        console.log('exists: /', test);
        console.log('exists: /tsconfig.json', await fs.exists('/tsconfig.json'))
        console.log('exists: /example.ts', await fs.exists('/example.ts'))
        const reader = new BrowserMessageReader(port);
        const writer = new BrowserMessageWriter(port);
        const connection = createConnection(reader, writer);
        console.log('created connection', connection)
        await createLanguageServer({ language, fs, connection });
        connection.listen();
        console.log('listening')
        return null;
    }

    Comlink.expose({ createLanguageServer: proxy }, port);
}
