import { configure, CopyOnWrite, promises as fs, resolveMountConfig, SingleBuffer } from "@zenfs/core";
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

    const handle = await navigator.storage.getDirectory()
    // @ts-ignore
    await handle.remove({ recursive: true });

    await configure({
        log: {
            enabled: true,
            level: 'debug',
            output: console.debug
        }
    })

    const writable = await resolveMountConfig({ backend: WebAccess, handle: await navigator.storage.getDirectory() })
    const readable = await resolveMountConfig({ backend: SingleBuffer, buffer })
    await readable.ready();
    await writable.ready();

    await configure({
        mounts: {
            '/': {
                backend: CopyOnWrite,
                readable,
                writable
            }
        },
        log: {
            enabled: true,
            level: 'debug',
            output: console.debug
        }
    })

    await readable?._populate()
    console.log('in fs worker', await fs.exists('/'))
    console.log('dirs', await fs.readdir('/'))
    console.log('readable dirs', await readable.readdir('/'))
    console.log('readable exists', await readable.exists('/'))
    console.log('readable usage', readable.usage())
    console.log('is root dir?', await readable.stat('/').catch(e => e))
    console.log('listing a known subdirectory:', await readable.readdir('/src').catch(e => e));

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