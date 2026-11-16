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

const keyKind = secretKey.startsWith("sb_secret_")
  ? "secret"
  : secretKey.startsWith("eyJ")
    ? "jwt"
    : "other";

// #region agent log
fetch("http://127.0.0.1:7686/ingest/ab68d8f7-59f7-4472-9baa-3354161bb732",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"abae79"},body:JSON.stringify({sessionId:"abae79",runId:"post-fix",hypothesisId:"A",location:"scripts/upload-desktop-release.mjs:41",message:"upload starting without supabase-js",data:{bucket,fileCount:files.length,keyKind,node:process.version},timestamp:Date.now()})}).catch(()=>{});
// #endregion

for (const file of files) {
  const filePath = path.join(releaseDir, file);
  const body = readFileSync(filePath);
  const contentType = file.endsWith(".yml")
    ? "text/yaml"
    : "application/octet-stream";
  const url = `${storageUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeURIComponent(file)}`;
  console.log(`Uploading ${file} to ${bucket}...`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": contentType,
      "cache-control": "60",
      "x-upsert": "true",
    },
    body,
  });
  if (!response.ok) {
    const detail = await response.text();
    // #region agent log
    fetch("http://127.0.0.1:7686/ingest/ab68d8f7-59f7-4472-9baa-3354161bb732",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"abae79"},body:JSON.stringify({sessionId:"abae79",runId:"post-fix",hypothesisId:"D",location:"scripts/upload-desktop-release.mjs:68",message:"storage upload rejected",data:{file,status:response.status,detail:detail.slice(0,180),keyKind},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    console.error(`Failed to upload ${file}: ${response.status} ${detail}`);
    process.exit(1);
  }
  // #region agent log
  fetch("http://127.0.0.1:7686/ingest/ab68d8f7-59f7-4472-9baa-3354161bb732",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"abae79"},body:JSON.stringify({sessionId:"abae79",runId:"post-fix",hypothesisId:"A",location:"scripts/upload-desktop-release.mjs:76",message:"storage upload accepted",data:{file,status:response.status,keyKind},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  console.log(`Uploaded ${file}`);
}
