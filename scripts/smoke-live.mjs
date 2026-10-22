// End-to-end check of a running sandbox (AC public-https, booked-record, no-booking, browser-cors).
// Usage: EXPECT_VERSION=<sha> node scripts/smoke-live.mjs [base-url]
// Used after the production deploy (https://carrier.demodb.dev) and on pull requests against a
// local `wrangler dev` of the PR's own code.
import { lookup } from "../src/sandbox.js";

const base = process.argv[2] ?? "https://carrier.demodb.dev";
const expectVersion = process.env.EXPECT_VERSION;

class CheckFailed extends Error {}

function check(cond, msg) {
  if (!cond) throw new CheckFailed(msg);
  console.log(`ok: ${msg}`);
}

async function get(path, init) {
  const res = await fetch(base + path, { redirect: "manual", ...init });
  for (const h of ["set-cookie", "access-control-allow-credentials"]) {
    check(res.headers.get(h) === null, `${path}: no ${h} header`);
  }
  // Zone-level Cloudflare NEL is an open question in the spec, not a Worker defect: warn only.
  for (const h of ["nel", "report-to"]) {
    if (res.headers.get(h) !== null) console.log(`::warning::${path}: zone-level ${h} header present (spec open question)`);
  }
  const type = res.headers.get("content-type") ?? "";
  check(res.status === 204 || type.startsWith("application/json"), `${path}: Worker JSON, not a challenge page`);
  check(res.headers.get("x-synthetic-data") === "true", `${path}: X-Synthetic-Data: true`);
  check(res.headers.get("access-control-allow-origin") === "*", `${path}: ACAO *`);
  check(res.headers.get("access-control-expose-headers") === "X-Synthetic-Data", `${path}: exposes X-Synthetic-Data`);
  return res;
}

async function run() {
  const root = await get("/");
  check(root.status === 200, "GET / is 200");
  check(root.headers.get("cache-control") === "no-store", "GET / is no-store");
  const doc = await root.json();
  check(/^[0-9a-f]{40}$/.test(doc.version), `version is a commit SHA (${doc.version})`);
  if (expectVersion) check(doc.version === expectVersion, `version is ${expectVersion}`);

  for (const id of ["request-11038", "request-11045", "request-11062"]) {
    const res = await get(`/v1/bookings?request_id=${id}`);
    check(res.status === 200, `${id}: 200`);
    check(res.headers.get("cache-control") === "public, max-age=300", `${id}: cacheable`);
    check((await res.text()) === JSON.stringify(lookup(id)), `${id}: body equals the contract record`);
  }
  const bad = await get("/v1/bookings");
  check(bad.status === 400 && (await bad.json()).error.code === "missing_request_id", "missing request_id is 400");
  for (const path of ["/v1/bookings", "/nowhere"]) {
    const pre = await get(path, {
      method: "OPTIONS",
      headers: { Origin: "https://datatug.app", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "accept, x-custom" },
    });
    check(pre.status === 204, `${path}: preflight 204`);
    check(pre.headers.get("access-control-allow-methods") === "GET, HEAD, OPTIONS", `${path}: allowed methods`);
    check(pre.headers.get("access-control-allow-headers") === "*", `${path}: allowed headers`);
    check(pre.headers.get("access-control-max-age") === "7200", `${path}: max-age`);
  }
}

// Retries cover a rollout still propagating or a dev server still starting.
for (let attempt = 1; ; attempt++) {
  try {
    await run();
    break;
  } catch (e) {
    if (attempt >= 12) {
      console.error(`FAIL: ${e instanceof CheckFailed ? e.message : e}`);
      process.exit(1);
    }
    console.log(`attempt ${attempt} failed (${e.message}); retrying in 10s`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
}
