import { ApplicationDatabase } from "./database.js";
import { assertCurrentMigrationState } from "./migration-state.js";

export async function openCurrentDatabase(databaseUrl: string): Promise<ApplicationDatabase> {
  const database = new ApplicationDatabase(databaseUrl);
  try {
    await assertCurrentMigrationState(database.db);
    return database;
  } catch (error) {
    await database.close();
    throw error;
  }
}
