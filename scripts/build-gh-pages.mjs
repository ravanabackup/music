#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const rootDir = process.cwd();
const apiDir = path.join(rootDir, "src", "app", "api");
const stashDir = path.join(rootDir, ".gh-pages-api-stash");
const outDir = path.join(rootDir, "out");

let movedApi = false;

try {
  if (fs.existsSync(apiDir)) {
    fs.renameSync(apiDir, stashDir);
    movedApi = true;
  }

  execSync("npx next build", {
    stdio: "inherit",
    env: {
      ...process.env,
      GITHUB_PAGES: "true",
      NEXT_PUBLIC_STATIC_EXPORT: "true",
    },
  });

  if (fs.existsSync(outDir)) {
    fs.writeFileSync(path.join(outDir, ".nojekyll"), "");
    const indexHtml = path.join(outDir, "index.html");
    const notFoundHtml = path.join(outDir, "404.html");
    if (fs.existsSync(indexHtml) && !fs.existsSync(notFoundHtml)) {
      fs.copyFileSync(indexHtml, notFoundHtml);
    }
  }
} finally {
  if (movedApi && fs.existsSync(stashDir)) {
    fs.renameSync(stashDir, apiDir);
  }
}
