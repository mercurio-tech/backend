export interface FileStorage {
    saveProjectFiles(opts: {
        id: number;
        image?: { buffer: Buffer; extension: string; mimetype: string };
        pdf?: { buffer: Buffer; mimetype: string };
    }): Promise<void>;

    deleteProjectFiles(
        id: number,
        opts: { image: boolean; pdf: boolean },
    ): Promise<void>;
}