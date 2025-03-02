// vite.config.js
import { defineConfig } from 'vite'
import { takeSnapshot } from './src/utils/snapshot';

const viteDefaults = {
    root: process.cwd(),
    include: ['**/*.{js,jsx,ts,tsx}'],
    exclude: ['node_modules', 'dist', 'build', 'coverage', 'public', 'static'],
    gitignore: true,
    transform: async (fs: any) => fs,
}

export type SnapshotProps = {
    root?: string;
    include?: string[];
    exclude?: string[];
    gitignore?: string | boolean | null;
    transform?: (tree: any) => any;
}

export const snapshot = async (props: SnapshotProps = {}) => {
    const { root, include, exclude, gitignore, transform } = { ...viteDefaults, ...props };
    const virtualModuleId = 'virtual:@jsnix/snapshot';
    const resolvedVirtualModuleId = '\0' + virtualModuleId;

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
                // @ts-expect-error
                const fsBuffer = await transform?.(await takeSnapshot({ root, include, exclude, gitignore }));
                return `export const fsbuffer = ${JSON.stringify(fsBuffer)}`
            }
            return undefined;
        },
    };
};

export default function getConfig() {
    return defineConfig({
        plugins: [
            snapshot({ gitignore: false, include: ['**/*'] })
        ],
    })
}