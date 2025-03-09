import { defineConfig } from 'vite'
import { takeSnapshot } from './src/utils/snapshot';
import fs from 'node:fs/promises';
import { promises as zenfs, configureSingle, resolveMountConfig, SingleBuffer } from '@zenfs/core';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const viteDefaults = {
    root: process.cwd(),
    include: ['example.ts', 'src', 'index.html', 'vite.config.ts', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', '.gitignore', 'node_modules/@types', 'node_modules/typescript'],
    exclude: ['.git', 'dist', 'build', 'coverage', 'static'],
    gitignore: true,
    transform: async (fs: ArrayBuffer) => fs,
}

export type SnapshotProps = {
    root?: string;
    include?: string[];
    exclude?: string[];
    gitignore?: string | boolean | null;
    transform?: (tree: ArrayBuffer) => ArrayBuffer;
}

export const snapshot = async (props: SnapshotProps = {}) => {
    const { root, include, exclude, gitignore, transform } = { ...viteDefaults, ...props };
    const virtualModuleId = 'virtual:@jsnix/snapshot';
    const resolvedVirtualModuleId = '\0' + virtualModuleId;
    // @ts-expect-error
    const fsBuffer = await transform?.(await takeSnapshot({ root, include, exclude, gitignore }));
    console.log('fsbuffer', fsBuffer.slice(0, 1000))
    await fs.writeFile('snapshot.bin', Buffer.from(fsBuffer));

    console.log('snapshot written')
    await configureSingle({ backend: SingleBuffer, buffer: Buffer.from(fsBuffer) });
    console.log('readable', await zenfs.readdir('/'))
    console.log('example.ts: \n', await zenfs.readFile('example.ts', { encoding: 'utf-8' }))

    return {
        name: '@jsnix/snapshot',
        async resolveId(id: string) {
            if (id === virtualModuleId) {
                return resolvedVirtualModuleId;
            }
            return undefined;
        },
        async load(id: string) {
            if (id === resolvedVirtualModuleId) {
                // console.log('have fsbuffer:\n', arrayBufferToBase64(fsBuffer))
                return `export const fsbuffer = ""`
            }
            return undefined;
        },
    };
};

export default async function getConfig() {
    return defineConfig({
        optimizeDeps: {
            entries: ['@zenfs/core', '@zenfs/dom'], // This is the line! 
        },
        plugins: [
            snapshot({ gitignore: false }),
            nodePolyfills({
                include: ['events']
            }),
        ],
        server: {
            headers: {
                'Cross-Origin-Embedder-Policy': 'credentialless',
                'Cross-Origin-Opener-Policy': 'same-origin',
            },
        },
    })
}