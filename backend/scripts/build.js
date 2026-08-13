import fs from "fs";
import path from "path";
import esbuild from "esbuild";

function getSourceFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);

  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat && stat.isDirectory()) {
      if (
        file !== "node_modules" &&
        file !== "dist" &&
        file !== "tests" &&
        file !== "scripts" &&
        file !== "__tests__"
      ) {
        results = results.concat(getSourceFiles(filePath));
      }
    } else if (
      file.endsWith(".ts") &&
      !file.endsWith(".d.ts") &&
      !file.endsWith(".test.ts") &&
      !file.endsWith(".spec.ts")
    ) {
      results.push(filePath);
    }
  }

  return results;
}

const entryPoints = getSourceFiles("src");
console.log(`[BUILD] Transpiling ${entryPoints.length} TypeScript backend files via esbuild...`);

const start = Date.now();
esbuild.buildSync({
  entryPoints,
  outdir: "dist",
  format: "esm",
  target: "node20",
  platform: "node",
  loader: { ".ts": "ts" },
});

console.log(`[SUCCESS] Backend production build completed in ${Date.now() - start}ms.`);
