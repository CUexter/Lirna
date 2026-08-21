import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";

export const exec = promisify(execFile);

export async function inspectCheckoutDetails(cwd = process.cwd()) {
  const [
    { stdout: root },
    { stdout: gitDirectory },
    { stdout: commonDirectory },
  ] = await Promise.all([
    exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"]),
    exec("git", [
      "-C",
      cwd,
      "rev-parse",
      "--path-format=absolute",
      "--git-dir",
    ]),
    exec("git", [
      "-C",
      cwd,
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]),
  ]);
  const [checkoutPath, gitPath, commonPath] = await Promise.all([
    realpath(root.trim()),
    realpath(gitDirectory.trim()),
    realpath(commonDirectory.trim()),
  ]);
  return {
    checkoutKind: gitPath === commonPath ? "primary" : "linked-worktree",
    checkoutPath,
    commonPath,
  };
}

export async function inspectCheckout(cwd = process.cwd()) {
  const { checkoutKind, checkoutPath } = await inspectCheckoutDetails(cwd);
  return { checkoutKind, checkoutPath };
}
