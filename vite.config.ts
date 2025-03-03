import { defineConfig } from 'vite'
import { takeSnapshot } from './src/utils/snapshot';
import fs from 'node:fs/promises';

const viteDefaults = {
    root: process.cwd(),
    include: ['src', 'index.html', 'vite.config.ts', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', '.gitignore', 'node_modules/@types', 'node_modules/typescript'],
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
    console.log('fsbuffer length', fsBuffer.byteLength)
    await fs.writeFile('snapshot.bin', Buffer.from(fsBuffer))

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
        plugins: [
            snapshot({ gitignore: false })
        ]
    })
}