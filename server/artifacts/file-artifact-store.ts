import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ArtifactStore {
  put(content: Buffer): Promise<{ hash: string }>;
  get(hash: string): Promise<Buffer | undefined>;
  /** Enumerate every content-addressed hash the adapter currently holds. */
  list(): Promise<string[]>;
  /**
   * Hash the bytes currently stored under `hash`, or `null` if no object is
   * stored there. The adapter owns its content-addressing algorithm; callers
   * verify integrity by comparing the result to the expected hash.
   */
  verify(hash: string): Promise<string | null>;
}

const hashPattern = /^[a-f0-9]{64}$/;

/** True when `value` is a 64-char lowercase hex sha256 content address. */
export function isContentHash(value: string): boolean {
  return hashPattern.test(value);
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
    if (!isContentHash(hash)) {
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

  async list(): Promise<string[]> {
    const shards = await readdir(this.root, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return [];
        }
        throw error;
      },
    );
    const hashes: string[] = [];
    for (const entry of shards) {
      if (!entry.isDirectory()) {
        continue;
      }
      const names = await readdir(join(this.root, entry.name));
      for (const name of names) {
        if (isContentHash(name)) {
          hashes.push(name);
        }
      }
    }
    return hashes;
  }

  async verify(hash: string): Promise<string | null> {
    const content = await this.get(hash);
    if (!content) {
      return null;
    }
    return createHash("sha256").update(content).digest("hex");
  }
}
