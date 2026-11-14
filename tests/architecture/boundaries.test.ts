import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function listTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listTsFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

describe("Clean Architecture Layer Boundaries", () => {
  const rootDir = path.resolve(__dirname, "../../src");

  it("Domain layer has zero framework, ORM, or outer-layer imports", () => {
    const domainFiles = listTsFiles(path.join(rootDir, "domain"));
    expect(domainFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      /from\s+["']next/,
      /from\s+["']react/,
      /from\s+["']drizzle-orm/,
      /from\s+["']pg["']/,
      /from\s+["']@/i,
      /from\s+["']\.\.\/\.\.\//,
    ];

    for (const file of domainFiles) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(
          pattern.test(content),
          `Forbidden import matching ${pattern} in domain file ${file}`,
        ).toBe(false);
      }
    }
  });

  it("Application layer imports ONLY from Domain or relative Application modules", () => {
    const appFiles = listTsFiles(path.join(rootDir, "application"));
    expect(appFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      /from\s+["']next/,
      /from\s+["']react/,
      /from\s+["']drizzle-orm/,
      /from\s+["']pg["']/,
      /from\s+["']@\/infrastructure/,
      /from\s+["']@\/interfaces/,
      /from\s+["']@\/components/,
      /from\s+["']@\/app/,
    ];

    for (const file of appFiles) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(
          pattern.test(content),
          `Forbidden outer-layer import matching ${pattern} in application file ${file}`,
        ).toBe(false);
      }
    }
  });

  it("Infrastructure runtime adapters enforce import 'server-only'", () => {
    const infraFiles = listTsFiles(path.join(rootDir, "infrastructure")).filter(
      (f) => !f.endsWith("schema.ts") && !f.endsWith("seed.ts"),
    );
    expect(infraFiles.length).toBeGreaterThan(0);

    for (const file of infraFiles) {
      const content = fs.readFileSync(file, "utf8");
      expect(
        content.includes('import "server-only"'),
        `Missing import "server-only" in ${file}`,
      ).toBe(true);
    }
  });
});
