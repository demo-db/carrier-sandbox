// Live check of the deployed sandbox (AC public-https, booked-record, no-booking, browser-cors).
// Usage: EXPECT_VERSION=<sha> node scripts/smoke-live.mjs [base-url]
const base = process.argv[2] ?? "https://carrier.demodb.dev";
const expectVersion = process.env.EXPECT_VERSION;

function check(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
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
  return res;
}

let lastError;
for (let attempt = 1; attempt <= 12; attempt++) {
  try {
    const root = await get("/");
    const doc = await root.json();
    if (!expectVersion || doc.version === expectVersion) break;
    lastError = `version ${doc.version} != ${expectVersion}`;
  } catch (e) {
    lastError = String(e);
  }
  if (attempt === 12) check(false, `deployed version: ${lastError}`);
  await new Promise((r) => setTimeout(r, 10_000));
}

const root = await get("/");
check(root.status === 200, "GET / is 200");
const doc = await root.json();
check(/^[0-9a-f]{40}$/.test(doc.version), `version is a commit SHA (${doc.version})`);

const booked = await get("/v1/bookings?request_id=request-11038");
const b = await booked.json();
check(booked.status === 200 && b.status === "booked" && b.booking_reference === "booking-11038", "request-11038 booked");
for (const id of ["request-11045", "request-11062"]) {
  const res = await get(`/v1/bookings?request_id=${id}`);
  const nb = await res.json();
  check(res.status === 200 && nb.status === "not_found" && nb.synthetic === true, `${id} not_found`);
}
const bad = await get("/v1/bookings");
check(bad.status === 400 && (await bad.json()).error.code === "missing_request_id", "missing request_id is 400");
const pre = await get("/v1/bookings", {
  method: "OPTIONS",
  headers: { Origin: "https://datatug.app", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "accept, x-custom" },
});
check(pre.status === 204 && pre.headers.get("access-control-allow-methods") === "GET, HEAD, OPTIONS", "preflight 204");
