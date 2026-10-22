// Production deploy: REQ:service-description requires the deployed commit SHA as VERSION.
// Usage: DEPLOY_VERSION=<40-char sha> node scripts/deploy.mjs
// Needs CLOUDFLARE_API_TOKEN (Workers Scripts: Edit; on demodb.dev Workers Routes: Edit,
// DNS: Edit, Zone: Read) and CLOUDFLARE_ACCOUNT_ID.
import { spawnSync } from "node:child_process";

const version = process.env.DEPLOY_VERSION ?? "";
if (!/^[0-9a-f]{40}$/.test(version)) {
  console.error("DEPLOY_VERSION must be the full 40-character commit SHA; refusing to deploy.");
  process.exit(1);
}
const result = spawnSync(
  "npx",
  ["--no-install", "wrangler", "deploy", "--var", `VERSION:${version}`],
  { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
);
process.exit(result.status ?? 1);
