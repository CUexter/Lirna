import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./server/operations/schema.ts", "./server/domain/schema.ts", "./server/artifacts/schema.ts", "./server/workflows/schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://lirna:lirna@127.0.0.1:5432/lirna",
  },
});
