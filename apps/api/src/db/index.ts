import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

type Db = NeonHttpDatabase<typeof schema>;

let _db: Db | null = null;

function getDb(): Db {
  if (!_db) {
    _db = drizzle(neon(process.env.DATABASE_URL!), { schema });
  }
  return _db;
}

// Lazy proxy so the connection is only created on first query at request
// time, not at build time when routes are imported for page-data collection.
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    return getDb()[prop as keyof Db];
  },
});

export * from "./schema";
