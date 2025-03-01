import path from 'node:path';
import parse from 'parse-gitignore';
import ignore, { Ignore } from 'ignore';
import { constants, PathLike } from 'node:fs';
import { promises as _fs, configure, CopyOnWrite, SingleBuffer } from "@zenfs/core";

export const pathExists = async (filePath: PathLike, fs: typeof _fs) => {
    try {
        await fs.access(filePath, constants.F_OK);
        return true; // The path exists
    }
    catch {
        return false; // The path does not exist
    }
};

export const buildTree = async function* (dir: string, source: typeof _fs, dest: typeof _fs, exclude?: Ignore, rootDir = dir): AsyncGenerator<string> {
    for await (const d of await source.opendir(dir)) {
        const entry = path.join(dir, d.name);
        const relativeEntry = path.relative(rootDir, entry);

        if (exclude && exclude.ignores(relativeEntry)) {
            continue;
        }

        if (d.isDirectory()) {
            await dest.mkdir(entry, { recursive: true });
            yield* buildTree(entry, source, dest, exclude, rootDir);
        }
        else if (d.isFile()) {
            const contents = await source.readFile(entry, 'utf8');
            await dest.writeFile(entry, contents, 'utf8');
            yield entry;
        }
        else if (d.isSymbolicLink()) {
            const symlink = await source.readlink(entry);
            if (tree) {
                tree[d.name] = { file: { symlink } };
            }
            yield entry;
        }
    }
};

export const buildIgnore = async (root: string, include: string[], exclude: string[], gitignore: string | null) => {
    const excluded = ignore().add(exclude);

    if (gitignore !== null) {
        const resolved = path.resolve(root, gitignore);

        if (await pathExists(resolved)) {
            const ignoreFiles = await fs.readFile(resolved);
            // @ts-ignore
            const { patterns } = parse(ignoreFiles);
            excluded.add(patterns);
        }
    }
    // include patterns are negated and should supercede exclude
    include = include.map((pattern) => pattern.startsWith('!') ? pattern.slice(1) : `!${pattern}`);
    excluded.add(include);

    return excluded;
};

export const snapshotDefaults: Required<SnapshotProps<unknown>> = {
    root: process.cwd(),
    include: [],
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
};
/**
 * Takes a snapshot of the file system based on the provided properties.
 *
 * @param props - The properties to configure the snapshot.
 */
export const takeSnapshot = async (props: Partial<TakeSnapshotProps> = {}) => {
    const { root, include, exclude, gitignore } = { ...snapshotDefaults, ...props };

    const excluded = await buildIgnore(root, include, exclude, gitignore);

    // eslint-disable-next-line
    for await (const _ of buildTree(root, filetree, excluded)) { }

    return filetree;
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
