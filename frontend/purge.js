import { PurgeCSS } from "purgecss";
import { readdirSync, writeFileSync, mkdirSync } from "fs";
import { join, relative } from "path";

const dist = join(import.meta.dirname, "dist");
const cwd = process.cwd();
const outputDir = join(dist, "assets");

const css = readdirSync(join(outputDir))
  .filter((f) => f.endsWith(".css"))
  .map((f) => relative(cwd, join(outputDir, f)).replace(/\\/g, "/"));

const content = [
  ...readdirSync(join(dist, "src", "web"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => relative(cwd, join(dist, "src", "web", f)).replace(/\\/g, "/")),
  ...readdirSync(join(dist, "src", "mobile"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => relative(cwd, join(dist, "src", "mobile", f)).replace(/\\/g, "/")),
  ...readdirSync(join(outputDir))
    .filter((f) => f.endsWith(".js"))
    .map((f) => relative(cwd, join(outputDir, f)).replace(/\\/g, "/")),
];

const results = await new PurgeCSS().purge({ css, content });

mkdirSync(outputDir, { recursive: true });
for (const result of results) {
  if (result.file && result.css !== undefined) {
    const fileName = result.file.split("/").pop();
    writeFileSync(join(outputDir, fileName), result.css);
  }
}

console.log(`Purged ${results.length} CSS file(s)`);
