import { exec, spawn } from "node:child_process";

export function unsafe(input: string) {
  document.body.innerHTML = input;
  exec(input);
  spawn(input, [], { shell: true });
  crypto.createHash("md5");
}

export function traversal(req: { query: { path: string } }) {
  return path.resolve("/srv/lirna", req.query.path);
}
