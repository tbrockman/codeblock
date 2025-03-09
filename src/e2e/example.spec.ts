import { test, expect } from '@playwright/test';
import * as Comlink from "comlink";
import { watchOptionsTransferHandler, asyncGeneratorTransferHandler } from '../rpc/serde';
import fs from '@zenfs/core';

Comlink.transferHandlers.set('asyncGenerator', asyncGeneratorTransferHandler);
Comlink.transferHandlers.set('watchOptions', watchOptionsTransferHandler);

declare global {
  interface Window {
    fs: typeof fs;
  }
}

const workerUrl = new URL('http://localhost:5173/dist/fs-worker.js').href;

test.describe('workers/fs', async () => {
  test('should initialize from existing buffer', async ({ page }) => {
    page.on('worker', worker => {
      console.log('Worker created: ' + worker.url());
      worker.on('console', msg => {
        console.log(`Worker console message: ${msg}`);
      });
      worker.on('close', worker => console.log('Worker destroyed: ' + worker.url()));
    });
    page.on('console', msg => console.log(msg.text()));
    page.on('console', msg => {
      if (msg.type() === 'error')
        console.log(`Error text: "${msg.text()}"`);
    });
    await page.goto('http://localhost:5173');
    await page.addScriptTag({ url: 'https://unpkg.com/comlink/dist/umd/comlink.js' });
    const content = await page.evaluate(async (workerUrl) => {
      console.log('before worker??')
      console.log(window.location.origin, 'before worker');
      const worker = new SharedWorker(workerUrl, { type: 'module' });
      console.log({ port: worker.port })
      const { init } = Comlink.wrap<{ init: (args: { buffer?: ArrayBuffer }) => Promise<any> }>(worker.port);
      worker.port.start();
      console.log('worker started');
      window.fs = Comlink.wrap<typeof fs>(await init({}));
      console.log('after fs init??', await window.fs);
      window.fs.writeFileSync('/example.ts', 'console.log("Hello, world!")');
      return window.fs.readFileSync('/example.ts', { encoding: 'utf-8' });
    }, workerUrl);

    expect(content).toBe('console.log("Hello, world!")');
    // const fileContent = await page.evaluate(async (proxy) => {
    //   return proxy.readFile('/some/path', 'utf-8');
    // }, fsProxy);

    // expect(fileContent).toBe('expected content');
  });

});
