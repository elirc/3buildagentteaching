import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Runs once before the integration suite.
 *
 * Loads .env.test, refuses to run against anything that is not obviously a test
 * database, then pushes the schema.
 */
export default function setup() {
  const root = resolve(__dirname, "../../../..");
  loadEnvFile(resolve(root, ".env.test"));

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.test.example to .env.test.");
  }

  /*
   * The guard rail that matters.
   *
   * setup.ts truncates every table between test files. If DATABASE_URL ever
   * pointed at the development database — a stale shell export, a copied .env,
   * a CI misconfiguration — the suite would silently destroy the seed data and
   * everyone would spend an hour wondering why their local app went blank.
   *
   * Requiring "_test" in the database name makes that impossible to do by
   * accident. It is a crude check and it is exactly proportionate to the
   * damage it prevents.
   */
  if (!/_test(\?|$)/.test(new URL(url).pathname + (new URL(url).search || ""))) {
    throw new Error(
      `Refusing to run integration tests against "${new URL(url).pathname}". ` +
        "The database name must end in _test — this suite truncates every table."
    );
  }

  execSync("npx prisma db push --schema packages/db/prisma/schema.prisma --skip-generate --accept-data-loss", {
    cwd: root,
    stdio: "inherit",
    env: process.env
  });
}

/**
 * Minimal .env parser.
 *
 * dotenv is not a dependency of this repo and adding one for four lines of
 * parsing is not worth the supply-chain surface. This handles KEY="value" and
 * KEY=value, ignores comments and blanks, and does not attempt interpolation —
 * which is all .env.test contains.
 */
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] = value;
  }
}
