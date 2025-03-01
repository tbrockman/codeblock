// vite.config.js
import { defineConfig } from 'vite'

const viteDefaults = {
    root: process.cwd(),
    include: ['**/*.{js,jsx,ts,tsx}'],
    exclude: ['node_modules', 'dist', 'build', 'coverage', 'public', 'static'],
    gitignore: true,
}

export type SnapshotProps = {
    root?: string;
    include?: string[];
    exclude?: string[];
    gitignore?: boolean;
    transform?: (tree: any) => any;
}

export const takeSnapshot = async (props: SnapshotProps): Promise<ArrayBuffer> => {
    return new ArrayBuffer(0x100000);
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