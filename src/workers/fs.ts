import { configureSingle, promises as fs } from "@zenfs/core";
import { WebAccess } from "@zenfs/dom";
import * as Comlink from "comlink";
import { watchOptionsTransferHandler, asyncGeneratorTransferHandler } from '../rpc/serde';

Comlink.transferHandlers.set('asyncGenerator', asyncGeneratorTransferHandler)
Comlink.transferHandlers.set('watchOptions', watchOptionsTransferHandler)

onconnect = async function (event) {
    await configureSingle({ backend: WebAccess, handle: await navigator.storage.getDirectory() })
    Comlink.expose(fs, event.ports[0]);
}