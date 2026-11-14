import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users } from "./schema";

async function seedAdmin() {
  const dbUrl = process.env.DATABASE_URL;
  const adminUsernameRaw = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

  if (!dbUrl) {
    throw new Error("DATABASE_URL is missing in .env");
  }
  if (!adminPassword || adminPassword.length < 8) {
    throw new Error(
      "INITIAL_ADMIN_PASSWORD must be set in .env and have at least 8 characters",
    );
  }

  const username = adminUsernameRaw.trim().toLowerCase();
  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle(pool);

  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    const passwordHash = await bcrypt.hash(adminPassword, 12);

    if (existing[0]) {
      await db
        .update(users)
        .set({
          role: "ADMIN",
          isActive: true,
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing[0].id));
      console.log(`[db:seed] Updated existing Admin account: @${username}`);
    } else {
      await db.insert(users).values({
        username,
        passwordHash,
        role: "ADMIN",
        isActive: true,
        showPhotographerInfo: true,
      });
      console.log(`[db:seed] Created initial Admin account: @${username}`);
    }
  } finally {
    await pool.end();
  }
}

seedAdmin().catch((err) => {
  console.error("[db:seed] Failed:", err);
  process.exit(1);
});
