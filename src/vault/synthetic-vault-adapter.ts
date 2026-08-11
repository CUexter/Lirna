import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface VaultAdapter {
  writeSyntheticResult(
    operationId: string,
    markdown: string,
  ): Promise<{ path: string }>;
}

export class SyntheticVaultAdapter implements VaultAdapter {
  constructor(private readonly root: string) {}

  async writeSyntheticResult(
    operationId: string,
    markdown: string,
  ): Promise<{ path: string }> {
    const relativePath = `synthetic/${operationId}.md`;
    await mkdir(join(this.root, "synthetic"), { recursive: true });
    await writeFile(join(this.root, relativePath), markdown, "utf8");
    return { path: relativePath };
  }
}
