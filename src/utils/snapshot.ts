import path from 'node:path';
import parse from 'parse-gitignore';
import * as nodeFs from 'node:fs';
import ignore, { Ignore } from 'ignore';
import { promises as _fs, AsyncFSMethods, configure, CopyOnWrite, mount, Passthrough, resolveMountConfig, SingleBuffer } from "@zenfs/core";

export type CopyDirOptions = {
    src: typeof _fs;
    dest: typeof _fs;
    exclude?: Ignore;
    rootDir?: string;
}

export const copyDir = async function* (dir: string, { src, dest, exclude, rootDir = dir }: CopyDirOptions): AsyncGenerator<string> {
    for await (let d of await src.opendir(dir)) {
        const entry = path.join(dir, d.name);
        const relativeEntry = path.relative(rootDir, entry);

        if (exclude && exclude.ignores(relativeEntry)) {
            continue;
        }

        if (d.isDirectory()) {
            await dest.mkdir(entry, { recursive: true });
            yield* copyDir(entry, { src, dest, exclude, rootDir });
        }
        else if (d.isFile()) {
            const contents = await src.readFile(entry, 'utf8');
            await dest.writeFile(entry, contents, 'utf8');
            yield entry;
        }
        else if (d.isSymbolicLink()) {
            const symlink = await src.readlink(entry);
            await dest.symlink(symlink, entry);
            yield entry;
        }
    }
};

export type IgnoreArgs = {
    fs: AsyncFSMethods,
    root: string,
    exclude: string[],
    gitignore: string | null
}

export const buildIgnore = async ({ fs, root, exclude, gitignore }: IgnoreArgs) => {
    const excluded = ignore().add(exclude);

    if (gitignore) {
        const resolved = path.resolve(root, gitignore);

        if (await fs.exists(resolved)) {
            const buf = new Uint8Array();
            const stat = await fs.stat(resolved)
            await fs.read(resolved, buf, 0, stat.size)
            // @ts-ignore
            const { patterns } = parse(new TextDecoder().decode(buf, 'utf-8'));
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

    // const writable = await resolveMountConfig()
    console.log('resolved writable')
    const buffer = new ArrayBuffer(1024 * 1024 * 1024 / 2);
    const readable = await resolveMountConfig({ backend: Passthrough, fs: nodeFs });
    const writable = await resolveMountConfig({ backend: SingleBuffer, buffer });
    console.log('before any mounting')
    mount('/mnt/host', readable);
    mount('/mnt/snapshot', writable);
    await readable.ready()
    const joined = path.join('/mnt/host', process.cwd())
    console.log('copying', joined, process.cwd(), 'what??', path.normalize(process.cwd()))
    const excluded = await buildIgnore({ fs: readable, root, exclude, gitignore });
    const included = ignore().add(include);

    console.log('exists', await _fs.exists(joined))

    try {
        await _fs.cp(joined, '/mnt/snapshot', {
            recursive: true,
            preserveTimestamps: true,
            filter: async (source, _) => {
                try {
                    const relativePath = path.relative(joined, source);
                    const isIncluded = included.ignores(relativePath) === true;
                    const isNotExcluded = excluded.ignores(relativePath) === false;
                    console.log('checking relative', relativePath, source, 'included: ', isIncluded && isNotExcluded)
                    return isIncluded && isNotExcluded
                } catch (e) {
                    console.error('got error', e)
                    return false;
                }
            },
        });
    } catch (e) {
        console.error('got error', e)

    }

    console.log('before buff')
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
