// Host-agnostic port for direct Vault-folder access (see ADR 0001). The shared
// web core owns this port so offline, outbox, and conflict logic stay
// host-independent; only the desktop Tauri host implements it against the real
// filesystem. The `revision` token pins the observed file revision so a stale
// write can be refused and re-checked after reload.
export interface VaultHost {
  /** Open a user-selected Markdown file, pinning the revision it was read at. */
  openMarkdown(): Promise<{ path: string; contents: string; revision: string }>;
  /** Save only if the pinned revision still matches; reject stale writes. */
  saveMarkdown(input: {
    path: string;
    contents: string;
    revision: string;
  }): Promise<{ revision: string }>;
}

// The browser PWA cannot reach the local Vault folder; direct access requires
// the desktop host. This default makes that boundary explicit rather than
// failing silently.
export const browserVaultHost: VaultHost = {
  async openMarkdown() {
    throw new Error("Direct Vault access requires the Lirna desktop host");
  },
  async saveMarkdown() {
    throw new Error("Direct Vault access requires the Lirna desktop host");
  },
};
