import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { digestToken, migrateDatabase, openDatabase } from "./index";

describe("migration checksum line-ending normalization", { timeout: 60_000 }, () => {
  it("normalizes a verified CRLF checksum and still rejects unrelated drift", async () => {
    const db = await openDatabase("memory://");
    try {
      await migrateDatabase(db.client);
      const sql = await readFile(new URL("../../migrations/0011_host_owned_identity.sql", import.meta.url), "utf8");
      const normalizedSql = sql.replace(/\r\n/g, "\n");
      const canonicalChecksum = digestToken(normalizedSql);
      const crlfChecksum = digestToken(normalizedSql.replace(/\n/g, "\r\n"));

      await db.client.query("UPDATE schema_migrations SET checksum=$1 WHERE name=$2", [crlfChecksum, "0011_host_owned_identity"]);
      await migrateDatabase(db.client);
      const afterNormalization = await db.client.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE name=$1", ["0011_host_owned_identity"],
      );
      expect(afterNormalization.rows[0]?.checksum).toBe(canonicalChecksum);

      await db.client.query("UPDATE schema_migrations SET checksum=$1 WHERE name=$2", ["f".repeat(64), "0011_host_owned_identity"]);
      await expect(migrateDatabase(db.client)).rejects.toThrow("Applied migration checksum mismatch for 0011_host_owned_identity");
    } finally {
      await db.client.close();
    }
  });
});
