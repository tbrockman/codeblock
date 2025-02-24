import { configureSingle, promises as fs } from "@zenfs/core";
import { WebAccess } from "@zenfs/dom";
import * as Comlink from "comlink";
import { asyncGeneratorTransferHandler } from "../utils";

Comlink.transferHandlers.set('asyncGenerator', asyncGeneratorTransferHandler)

onconnect = async function (event) {
    await configureSingle({ backend: WebAccess, handle: await navigator.storage.getDirectory() })

    async function* watch(path: string, options: { encoding?: string; recursive?: boolean }) {
        // Watch the file system for changes, handling the abort signal
        // @ts-expect-error
        for await (const event of fs.watch(path, { encoding: options.encoding, recursive: options.recursive })) {
            console.error('event', event)
            yield event; // Yield events as they occur
        }
    }

    Comlink.expose({
        ...fs
    }, event.ports[0]);
}