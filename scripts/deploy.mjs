// Production deploy: REQ:service-description requires the deployed commit SHA as VERSION.
// Usage: DEPLOY_VERSION=<40-char sha> node scripts/deploy.mjs
// Refuses unless DEPLOY_VERSION is the checked-out HEAD and the tree is clean, so the label
// always names the code being shipped. Needs CLOUDFLARE_API_TOKEN (Workers Scripts: Edit; on
// demodb.dev Workers Routes: Edit, DNS: Edit, Zone: Read) and CLOUDFLARE_ACCOUNT_ID.
import { execFileSync, spawnSync } from "node:child_process";

function refuse(msg) {
  console.error(`${msg}; refusing to deploy.`);
  process.exit(1);
}

const version = process.env.DEPLOY_VERSION ?? "";
if (!/^[0-9a-f]{40}$/.test(version)) refuse("DEPLOY_VERSION must be the full 40-character commit SHA");
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (head !== version) refuse(`DEPLOY_VERSION ${version} is not the checked-out HEAD ${head}`);
const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim();
if (dirty !== "") refuse(`the working tree has uncommitted changes:\n${dirty}`);

const result = spawnSync(
  "npx",
  ["--no-install", "wrangler", "deploy", "--var", `VERSION:${version}`],
  { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
);
process.exit(result.status ?? 1);
