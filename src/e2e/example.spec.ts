import { test, expect } from '@playwright/test';
import * as Comlink from "comlink";
import { watchOptionsTransferHandler, asyncGeneratorTransferHandler } from '../rpc/serde';

Comlink.transferHandlers.set('asyncGenerator', asyncGeneratorTransferHandler);
Comlink.transferHandlers.set('watchOptions', watchOptionsTransferHandler);

test.describe('workers/fs', () => {
  test('should initialize from existing buffer', async ({ page }) => {
    await page.addScriptTag({ url: 'https://unpkg.com/comlink/dist/umd/comlink.js' });

    await page.evaluate(() => {
      Object.defineProperty(window, 'location', {
        value: new URL('http://localhost:5173'),
        writable: true,
      });
    });

    await page.exposeFunction('initSharedWorker', async () => {
      return await page.evaluate(() => {
        console.log(window.location.origin);
        const url = new URL('/dist/fs-worker.js', window.location.origin).href;
        console.log(url)
        const worker = new SharedWorker(url, { type: 'module' });
        worker.port.start();
        return Comlink.wrap<{ init: (args: { buffer?: ArrayBuffer }) => Promise<any> }>(worker.port);
      });
    });

    const fsProxy = await page.evaluate(async () => {
      const proxy = await window.initSharedWorker();
      return proxy.init({ buffer: new ArrayBuffer(1024) });
    });

    expect(fsProxy).toBeDefined();
    // const fileContent = await page.evaluate(async (proxy) => {
    //   return proxy.readFile('/some/path', 'utf-8');
    // }, fsProxy);

    // expect(fileContent).toBe('expected content');
  });

});
