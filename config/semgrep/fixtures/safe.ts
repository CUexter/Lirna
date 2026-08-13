import { execFile } from "node:child_process";

export function safe(input: string) {
  return execFile("git", ["show", input]);
}
