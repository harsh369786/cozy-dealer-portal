import { createDevDatabase } from "../api/db/sqlite-d1.ts";

const db = await createDevDatabase();
console.log("Seed complete. Users:", (await db.prepare("SELECT COUNT(*) as c FROM users").first<{ c: number }>())?.c);
