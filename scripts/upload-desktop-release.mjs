import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const storageUrl = process.env.DESKTOP_UPDATE_STORAGE_URL?.trim().replace(/\/$/, "");
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
const bucket = process.env.DESKTOP_UPDATE_BUCKET?.trim();
if (!storageUrl || !secretKey || !bucket) {
  console.error(
    "DESKTOP_UPDATE_STORAGE_URL, SUPABASE_SECRET_KEY, and DESKTOP_UPDATE_BUCKET are required",
  );
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = process.env.RELEASE_DIR
  ? path.resolve(process.env.RELEASE_DIR)
  : path.join(root, "apps/desktop/release");

function isReleaseFile(name) {
  return (
    name.endsWith(".exe") ||
    name.endsWith(".blockmap") ||
    name.endsWith(".AppImage") ||
    name === "latest.yml" ||
    name === "latest-linux.yml"
  );
}

const files = readdirSync(releaseDir).filter((name) => {
  if (!isReleaseFile(name)) return false;
  return statSync(path.join(releaseDir, name)).isFile();
});
if (files.length === 0) {
  console.error(`No installer, blockmap, or yml files in ${releaseDir}`);
  process.exit(1);
}
files.sort((a, b) => Number(a.endsWith(".yml")) - Number(b.endsWith(".yml")));

const supabase = createClient(storageUrl, secretKey);

for (const file of files) {
  const filePath = path.join(releaseDir, file);
  const body = readFileSync(filePath);
  console.log(`Uploading ${file} to ${bucket}...`);
  const { error } = await supabase.storage.from(bucket).upload(file, body, {
    upsert: true,
    cacheControl: "60",
    contentType: file.endsWith(".yml")
      ? "text/yaml"
      : "application/octet-stream",
  });
  if (error) {
    console.error(`Failed to upload ${file}:`, error.message);
    process.exit(1);
  }
  console.log(`Uploaded ${file}`);
}
