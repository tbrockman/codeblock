import { configure, CopyOnWrite, promises as fs, resolveMountConfig, SingleBuffer, umount } from "@zenfs/core";
import { WebAccess } from "@zenfs/dom";
import * as Comlink from "comlink";
import { watchOptionsTransferHandler, asyncGeneratorTransferHandler } from '../rpc/serde';

Comlink.transferHandlers.set('asyncGenerator', asyncGeneratorTransferHandler)
Comlink.transferHandlers.set('watchOptions', watchOptionsTransferHandler)

onconnect = async function (event) {

    console.log('fs worker started')
    // TODO: make configurable
    const fsSnapshot = new URL('/snapshot.bin', location.origin);
    console.log('snapshot url', fsSnapshot)
    const res = await fetch(fsSnapshot);
    const buffer = await res.arrayBuffer();
    console.log('buffer retrieved', buffer)

    // const handle = await navigator.storage.getDirectory()
    // @ts-ignore
    // await handle.remove({ recursive: true });

    // await configure({

    //     log: {
    //         enabled: true,
    //         level: 'debug',
    //         output: console.debug
    //     }
    // })


    umount('/')
    await configure({
        mounts: {
            '/': {
                backend: CopyOnWrite,
                readable: { backend: SingleBuffer, buffer },
                writable: { backend: WebAccess, handle: await navigator.storage.getDirectory() }
            }
        },
        log: {
            enabled: true,
            level: 'debug',
            output: console.debug
        }
    })

    // await configureSingle({ backend: WebAccess, handle: await navigator.storage.getDirectory() })
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
    Comlink.expose(proxy, event.ports[0]);
}