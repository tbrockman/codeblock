import type { promises as fs } from "@zenfs/core"

export interface FS {
    /**
     * Reads the entire contents of a file asynchronously
     * @param path A path to a file
     */
    readFile: (
        path: string,
    ) => Promise<string>;

    /**
     * Writes data to a file asynchronously
     * @param path A path to a file
     * @param data The data to write
     */
    writeFile: (
        path: string,
        data: string,
    ) => Promise<void>;

    /**
     * Watch for changes to a file or directory
     * @param path A path to a file/directory
     * @param options Configuration options for watching
     */
    watch: (
        path: string,
        options: {
            signal: AbortSignal,
        }
    ) => AsyncGenerator<{ eventType: 'rename' | 'change', filename: string }>;

    /**
     * Creates a directory asynchronously
     * @param path A path to a directory, URL, or parent FileSystemDirectoryHandle
     * @param options Configuration options for directory creation
     */
    mkdir: (
        path: string,
        options: {
            recursive: boolean,
        }
    ) => Promise<void>;

    /**
     * Checks whether a given file or folder exists
     * @param path A path to a file or folder
     * @returns A promise that resolves to true if the file or folder exists, false otherwise
     */
    exists: (
        path: string,
    ) => Promise<boolean>;
}

export type WorkerFS = Omit<typeof fs, 'watch'> &
{
    watch: (path: string, options: { encoding: 'utf-8', recursive: true }) => {
        iter: AsyncGenerator<{ eventType: 'rename' | 'change', filename: string }>
        signal: { abort: () => void }
    }
};
