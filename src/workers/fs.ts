import { configureSingle, CopyOnWrite, promises as fs, resolveMountConfig, SingleBuffer } from "@zenfs/core";
import { WebAccess } from "@zenfs/dom";
import * as Comlink from "comlink";
import { watchOptionsTransferHandler, asyncGeneratorTransferHandler } from '../rpc/serde';
import { InitArgs, InitResult } from "../types";

Comlink.transferHandlers.set('asyncGenerator', asyncGeneratorTransferHandler)
Comlink.transferHandlers.set('watchOptions', watchOptionsTransferHandler)

const init = async ({ buffer = new ArrayBuffer(0x100000) }: InitArgs): Promise<InitResult> => {
    console.log('Init started with buffer size:', buffer.byteLength);
    try {
        console.log('Getting storage directory...');
        const handle = await navigator.storage.getDirectory();
        console.log('Got storage directory');

        console.log('Attempting to remove directory...');
        try {
            // @ts-ignore
            await handle.remove({ recursive: true });
            console.log('Successfully removed directory');
        } catch (removeErr) {
            console.error('Error removing directory:', removeErr);
            // Continue anyway, this might not be critical
        }

        console.log('Resolving mount config...');
        const readable = await resolveMountConfig({
            backend: SingleBuffer,
            buffer,
        });
        console.log('Mount config resolved');

        console.log('Configuring single...');
        await configureSingle({
            backend: CopyOnWrite,
            readable,
            writable: {
                backend: WebAccess,
                handle: await navigator.storage.getDirectory()
            }
        });

        // Create and return proxy
        console.log('Creating proxy...');
        const proxy = new Proxy(fs, {
            get(obj, prop) {
                if (typeof obj[prop] === "function") {
                    return function (...args) {
                        try {
                            console.log(`Method called: ${prop}, Arguments: ${JSON.stringify(args)}`);
                            return obj[prop].apply(this, args);
                        } catch (e) {
                            console.error(`Error calling method: ${prop}, Arguments: ${JSON.stringify(args)}, Error: ${e}`);
                        }
                    };
                }
                return obj[prop];
            },
        })
        console.log('Returning proxy from worker');
        return Comlink.proxy({ fs: Comlink.proxy(proxy) });
    } catch (e) {
        console.error('Worker initialization failed with error:', e);
        throw e; // Make sure error propagates
    }
}

onconnect = async function (event) {
    console.log('workers/fs connected on port: ', event.ports[0]);
    Comlink.expose({ init }, event.ports[0]);
}
