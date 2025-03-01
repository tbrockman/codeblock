import { configureSingle, promises as fs } from "@zenfs/core";
import { WebAccess } from "@zenfs/dom";
import * as Comlink from "comlink";
import { watchOptionsTransferHandler, asyncGeneratorTransferHandler } from '../rpc/serde';

Comlink.transferHandlers.set('asyncGenerator', asyncGeneratorTransferHandler)
Comlink.transferHandlers.set('watchOptions', watchOptionsTransferHandler)

onconnect = async function (event) {
    await configureSingle({ backend: WebAccess, handle: await navigator.storage.getDirectory() })
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