import path from 'node:path';
import parse from 'parse-gitignore';
import * as nodeFs from 'node:fs';
import ignore, { Ignore } from 'ignore';
import { promises as _fs, configure, configureSingle, CopyOnWrite, mount, Passthrough, resolveMountConfig, SingleBuffer } from "@zenfs/core";

export const copyDir = async (fs: typeof _fs, source: string, dest: string, include: ignore.Ignore, exclude: ignore.Ignore) => {
    const symlinkQueue: { src: string; dest: string }[] = [];

    async function copyRecursive(src: string, dst: string) {
        try {
            console.log('copying', src, 'to', dst)
            const entries = await fs.readdir(src, { withFileTypes: true });
            console.log('mkdir fs')
            await fs.mkdir(dst, { recursive: true });
            console.log('after mkdir')

            for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const srcRelPath = path.relative(source, srcPath);
                const dstPath = path.join(dst, entry.name);

                if (exclude.ignores(srcRelPath) || !include.ignores(srcRelPath)) continue;

                console.log('copying', srcPath, 'to', dstPath)

                if (entry.isDirectory()) {
                    await copyRecursive(srcPath, dstPath);
                } else if (entry.isFile()) {
                    try {
                        console.log('before reading')
                        const data = nodeFs.readFileSync(srcRelPath);
                        console.log('after reading', srcRelPath, data.length)
                        await fs.writeFile(dstPath, Buffer.from(data.buffer));
                        console.log('after writing')
                    } catch (e) {
                        console.error(`Failed to copy ${srcPath} to ${dstPath}:`, e);
                    }
                } else if (entry.isSymbolicLink()) {
                    symlinkQueue.push({ src: srcPath, dest: dstPath });
                }
            }
        } catch (e) {
            console.error(`Failed to copy ${src} to ${dest}:`, e);
        }
    }

    async function resolveSymlinks() {
        for (const { src, dest } of symlinkQueue) {
            try {
                const target = await fs.readlink(src);
                const absoluteTarget = path.resolve(path.dirname(src), target);

                try {
                    await fs.stat(absoluteTarget);
                    await fs.symlink(target, dest);
                } catch {
                    await fs.copyFile(absoluteTarget, dest);
                }
            } catch (err) {
                console.error(`Failed to copy symlink ${src}:`, err);
            }
        }
    }

    await copyRecursive(source, dest);
    await resolveSymlinks();
}

export type IgnoreArgs = {
    fs: typeof _fs,
    root: string,
    exclude: string[],
    gitignore: string | null
}

export const buildIgnore = async ({ fs, root, exclude, gitignore }: IgnoreArgs) => {
    const excluded = ignore().add(exclude);

    if (gitignore) {
        const resolved = path.resolve(root, gitignore);
        console.log('...building gitignore')

        if (await fs.exists(resolved)) {
            const content = await fs.readFile(resolved, 'utf-8')
            // @ts-ignore
            const { patterns } = parse(content);
            excluded.add(patterns);
        }
    }
    // ???
    // excluded.add(include.map((pattern) => pattern.startsWith('!') ? pattern.slice(1) : `!${pattern}`));

    return excluded;
};

export const snapshotDefaults: Required<SnapshotProps<unknown>> = {
    root: process.cwd(),
    fs: _fs,
    include: ['.'],
    exclude: ['.git'],
    gitignore: '.gitignore',
    transform: async (fs: typeof _fs) => fs,
};
export type SnapshotProps<T> = {
    transform?: (fs: typeof _fs) => Promise<typeof _fs>;
} & Partial<TakeSnapshotProps> & T;
export type TakeSnapshotProps = {
    root: string;
    include: string[];
    exclude: string[];
    gitignore: string | null;
    fs: typeof _fs;
};
/**
 * Takes a snapshot of the file system based on the provided properties.
 *
 * @param props - The properties to configure the snapshot.
 */
export const takeSnapshot = async (props: Partial<TakeSnapshotProps> = {}) => {
    const { root, include, exclude, gitignore } = { ...snapshotDefaults, ...props };
    const buffer = new ArrayBuffer((1024 * 1024 * 1024) / 8);

    try {
        // console.log('resolving config')
        // const readable = await resolveMountConfig({ backend: Passthrough, fs: nodeFs, prefix: process.cwd() });
        // const writable = await resolveMountConfig({ backend: SingleBuffer, buffer });
        // console.log('mounting')
        // mount('/mnt/host', readable);
        // mount('/mnt/snapshot', writable);
        // console.log('mounted')
        // await readable.ready()
        // await writable.ready()
        // console.log('building ingore', include, exclude)
        // const excluded = await buildIgnore({ fs: _fs, root, exclude, gitignore });
        // const included = ignore().add(include);
        // console.log('copying dir')
        // await copyDir(_fs, '/mnt/host', '/mnt/snapshot', included, excluded)
        // console.log('writable', await writable.readdir('/'))
        // console.log('fs')

        await configureSingle({ backend: SingleBuffer, buffer });
        // const writable = await resolveMountConfig();
        await _fs.writeFile('example.ts', 'console.log("hello world")');
    } catch (e) {
        console.error('got error', e)
    }
    return buffer;

    // eslint-disable-next-line
    // for await (const _ of copyDir(root, { src, dest, include, exclude: excluded })) { }

};

// todo: fix/verify
export const restore = async (buffer: ArrayBuffer, mount: string, fs: typeof _fs) => {
    await configure({
        mounts: {
            '/mnt/snapshot': {
                backend: SingleBuffer,
                buffer
            },
            [mount]: {
                backend: CopyOnWrite,
                options: {
                    readable: '/mnt/snapshot',
                    writable: fs,
                }
            }
        }
    })
};
