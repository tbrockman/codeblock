import * as Comlink from 'comlink';
import { createLanguageServer, CreateLanguageServerArgs } from '../lsp';
import { createConnection } from '@volar/language-server/browser';

onconnect = async (event) => {
    const port = event.ports[0];
    console.log('LSP worker connected on port: ', port);

    const proxy = async ({ language, fs }: Omit<CreateLanguageServerArgs, 'connection'>) => {
        const test = await fs.exists('/');
        console.log('test', test);
        const connection = createConnection()
        console.log('created connection', connection)
        await createLanguageServer({ language, fs, connection });
        console.log('created language server')
        connection.listen();
        console.log('listening')
        return null;
    }

    Comlink.expose({ createLanguageServer: proxy }, port);
}
