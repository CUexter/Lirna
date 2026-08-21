import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

const identityPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const databaseNamePattern = /^lirna_[0-9a-f]{32}$/;

function databaseName(identity: string) {
  const name = `lirna_${identity.replaceAll("-", "")}`;
  if (!identityPattern.test(identity) || !databaseNamePattern.test(name)) {
    throw new Error("The managed lifecycle identity cannot name a database.");
  }
  return name;
}

export async function provisionManagedDatabase({
  adminUrl,
  identity,
  migrationsFolder,
}: {
  adminUrl: string;
  identity: string;
  migrationsFolder: string;
}) {
  const name = databaseName(identity);
  const targetUrl = new URL(adminUrl);
  targetUrl.pathname = `/${name}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(
      "SELECT pg_advisory_lock(hashtext('lirna lifecycle database provisioning'))",
    );
    try {
      let created = false;
      const existing = await admin.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [name],
      );
      if (existing.rowCount === 0) {
        await admin.query(`CREATE DATABASE "${name}"`);
        created = true;
      }

      try {
        const migrationPool = new Pool({
          connectionString: targetUrl.toString(),
        });
        try {
          await migrate(drizzle(migrationPool), { migrationsFolder });
        } finally {
          await migrationPool.end();
        }
      } catch (error) {
        if (created) {
          await admin
            .query(`DROP DATABASE "${name}" WITH (FORCE)`)
            .catch(() => {});
        }
        throw error;
      }
    } finally {
      await admin.query(
        "SELECT pg_advisory_unlock(hashtext('lirna lifecycle database provisioning'))",
      );
    }
  } finally {
    await admin.end();
  }
  return name;
}
