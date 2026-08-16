declare const context: {
  req: { query(name: string): string };
};

// biome-ignore lint/security/noGlobalEval: This file verifies Semgrep flags unsafe code.
eval(context.req.query("expression"));

const tlsOptions = {
  rejectUnauthorized: false,
};
void tlsOptions;
