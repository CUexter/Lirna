import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ArtifactStore {
  put(content: Buffer): Promise<{ hash: string }>;
  get(hash: string): Promise<Buffer | undefined>;
}

export class FileArtifactStore implements ArtifactStore {
  constructor(private readonly root: string) {}

  async put(content: Buffer): Promise<{ hash: string }> {
    const hash = createHash("sha256").update(content).digest("hex");
    const directory = join(this.root, hash.slice(0, 2));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, hash), content, { flag: "wx" }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") {
          throw error;
        }
      },
    );
    return { hash };
  }

  async get(hash: string): Promise<Buffer | undefined> {
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      return undefined;
    }

    return readFile(join(this.root, hash.slice(0, 2), hash)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return undefined;
        }
        throw error;
      },
    );
  }
}
