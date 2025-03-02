import path from 'node:path';
import parse from 'parse-gitignore';
import * as nodeFs from 'node:fs';
import ignore, { Ignore } from 'ignore';
import { constants, PathLike } from 'node:fs';
import { promises as _fs, configure, CopyOnWrite, Passthrough, resolveMountConfig, SingleBuffer } from "@zenfs/core";

export const pathExists = async (filePath: PathLike, fs: typeof _fs) => {
    try {
        await fs.access(filePath, constants.F_OK);
        return true; // The path exists
    }
    catch {
        return false; // The path does not exist
    }
};


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
    fs: typeof _fs,
    root: string,
    exclude: string[],
    gitignore: string | null
}

export const buildIgnore = async ({ fs = _fs, root, exclude, gitignore }: IgnoreArgs) => {
    const excluded = ignore().add(exclude);

    if (gitignore) {
        const resolved = path.resolve(root, gitignore);

        if (await pathExists(resolved, fs)) {
            const ignoreFiles = await fs.readFile(resolved);
            // @ts-ignore
            const { patterns } = parse(ignoreFiles);
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

    const readable = await resolveMountConfig({ backend: Passthrough, label: 'ro', fs: nodeFs });

    configure({
        mounts: {
            '/mnt/snapshot': {
                backend: SingleBuffer,
                buffer: new ArrayBuffer(0x10000000),
            },
            '/': {
                backend: CopyOnWrite,
                options: {
                    readable,
                    writable: '/mnt/snapshot',
                }
            }
        }
    })

    _fs.cp(process.cwd(), '/mnt/snapshot', {
        recursive: true,
        preserveTimestamps: true,
        filter: async (source, destination) => {
            console.log('source', source, destination)
            const excluded = await buildIgnore({ fs: _fs, root, exclude, gitignore });
            const relativePath = path.relative(root, source);
            return excluded.ignores(relativePath) === false;
        },
    });

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
