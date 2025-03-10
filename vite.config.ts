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
    // @ts-expect-error
    const fsBuffer = await transform?.(await takeSnapshot({ root, include, exclude, gitignore }));
    // console.log('fsbuffer', fsBuffer.slice(0, 1000))
    await fs.writeFile('./public/snapshot.bin', new Uint8Array(fsBuffer));

    console.log('snapshot written')
    await configureSingle({ backend: SingleBuffer, buffer: new Uint8Array(fsBuffer) });
    const dir = await zenfs.readdir('/');
    console.log('dir', dir)

    dir.forEach(async (file) => {
        if ((await zenfs.stat(file)).isDirectory()) return;
        console.log('content', file, (await zenfs.readFile(file, 'utf-8')).slice(0, 100));
    })

    return {
        name: '@jsnix/snapshot'
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