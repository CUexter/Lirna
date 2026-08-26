import { glob } from "tinyglobby";

const shard = process.env.MUTATION_SHARD;

const shardMutate = {
  "api-sep-reading": [
    "packages/api/src/sep-admission/sep-reading*.ts",
    "packages/api/src/sep-admission/sep-bibliography.ts",
    "packages/api/src/sep-admission/sep-html.ts",
  ],
  "api-sep-capture": [
    "packages/api/src/sep-admission/**/*.ts",
    "!packages/api/src/sep-admission/sep-reading*.ts",
    "!packages/api/src/sep-admission/sep-bibliography.ts",
    "!packages/api/src/sep-admission/sep-html.ts",
  ],
  "api-core": [
    "packages/api/src/**/*.ts",
    "!packages/api/src/sep-admission/**",
  ],
  "web-annotations": ["apps/web/src/components/annotations/**/*.{ts,tsx}"],
  "web-reading": ["apps/web/src/components/reading-workspace/**/*.{ts,tsx}"],
  "web-source": [
    "apps/web/src/components/{app-shell,source-admission,sources-library}/**/*.{ts,tsx}",
  ],
  "web-app": [
    "apps/web/src/**/*.{ts,tsx}",
    "!apps/web/src/components/**",
    "!apps/web/src/main.tsx",
  ],
  platform: [
    "apps/docs/src/**/*.{ts,tsx}",
    "apps/server/src/**/*.{ts,tsx}",
    "packages/{auth,db,env,ui}/src/**/*.{ts,tsx}",
  ],
};

const shardTests = {
  "api-sep-reading": [
    "packages/api/src/sep-admission/sep-reading*.test.ts",
    "packages/api/src/sep-admission/sep-bibliography.test.ts",
    "packages/api/src/sep-admission/sep-html.test.ts",
  ],
  "api-sep-capture": ["packages/api/src/sep-admission/**/*.test.ts"],
  "api-core": [
    "packages/api/src/**/*.test.ts",
    "!packages/api/src/sep-admission/**",
  ],
  "web-annotations": [
    "apps/web/src/components/annotations/**/*.{test,spec}.{ts,tsx}",
  ],
  "web-reading": [
    "apps/web/src/components/reading-workspace/**/*.{test,spec}.{ts,tsx}",
  ],
  "web-source": [
    "apps/web/src/components/source-admission/**/*.{test,spec}.{ts,tsx}",
    "apps/web/src/components/sources-library/**/*.{test,spec}.{ts,tsx}",
  ],
  "web-app": [
    "apps/web/src/{clients,hooks,routes,utils}/**/*.{test,spec}.{ts,tsx}",
    "apps/web/tests/routes/**/*.{test,spec}.{ts,tsx}",
  ],
  platform: [
    "apps/{docs,server}/src/**/*.{test,spec}.{ts,tsx}",
    "packages/{auth,db,env,ui}/src/**/*.{test,spec}.{ts,tsx}",
  ],
};

if (!(shard in shardMutate)) {
  throw new Error(
    `MUTATION_SHARD must be one of: ${Object.keys(shardMutate).join(", ")}`,
  );
}

const testFiles = await glob([...shardTests[shard], "!**/node_modules/**"]);

export default {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  mutate: [
    ...shardMutate[shard],
    "!**/*.test.{ts,tsx}",
    "!**/test-*.{ts,tsx}",
    "!**/*-test-*.{ts,tsx}",
    "!**/fixtures/**",
    "!**/test-support/**",
    "!**/*.gen.{ts,tsx}",
  ],
  plugins: ["@hughescr/stryker-bun-runner"],
  testRunner: "bun",
  coverageAnalysis: shard === "web-annotations" ? "off" : "perTest",
  concurrency: 2,
  timeoutMS: 30_000,
  maxTestRunnerReuse: 100,
  bun: {
    timeout: 30_000,
    env: { VITE_SERVER_URL: "http://127.0.0.1:3000" },
    bunArgs: ["--isolate", "--preload", "./happydom.ts"],
    testFiles,
  },
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: {
    fileName: `reports/mutation/${shard}/index.html`,
  },
  jsonReporter: {
    fileName: `reports/mutation/${shard}/mutation.json`,
  },
  tempDirName: `.stryker-tmp/${shard}`,
  ignorePatterns: [
    ".agents/**",
    ".claude/**",
    ".codegraph/**",
    ".direnv/**",
    ".stryker-tmp/**",
    "coverage/**",
    "prototype/**",
    "result",
    "result-*/**",
  ],
};
