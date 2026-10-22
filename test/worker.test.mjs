// Unit tests for the carrier booking lookup contract (spec/features/carrier-booking-lookup).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import worker, { NOTICE, makeHandler } from "../src/index.js";

const BASE = "https://carrier.demodb.dev";
const SHA = "0123456789abcdef0123456789abcdef01234567";

function send(path, { method = "GET", headers = {} } = {}) {
  return worker.fetch(new Request(BASE + path, { method, headers }), { VERSION: SHA });
}

async function body(res) {
  return JSON.parse(await res.text());
}

function assertLabelled(res) {
  assert.equal(res.headers.get("x-synthetic-data"), "true");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(res.headers.get("access-control-expose-headers"), "X-Synthetic-Data");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("access-control-allow-credentials"), null);
  assert.equal(res.headers.get("set-cookie"), null);
}

const LOOKUP_FIELDS = [
  "request_id",
  "status",
  "booking_reference",
  "carrier",
  "booked_at",
  "as_of",
  "synthetic",
  "notice",
];

test("AC booked-record: request-11038 is booked", async () => {
  const res = send("/v1/bookings?request_id=request-11038");
  assert.equal(res.status, 200);
  assertLabelled(res);
  const b = await body(res);
  assert.deepEqual(Object.keys(b), LOOKUP_FIELDS);
  assert.deepEqual(b, {
    request_id: "request-11038",
    status: "booked",
    booking_reference: "booking-11038",
    carrier: "united-package",
    booked_at: "2018-04-30T09:00:04Z",
    as_of: "2018-05-20T10:00:00Z",
    synthetic: true,
    notice: NOTICE,
  });
});

test("AC no-booking: 11045, 11062, a control and an unknown id are not_found", async () => {
  for (const id of ["request-11045", "request-11062", "request-90001", "request-90005", "request-99999"]) {
    const res = send(`/v1/bookings?request_id=${id}`);
    assert.equal(res.status, 200, id);
    assertLabelled(res);
    const b = await body(res);
    assert.deepEqual(Object.keys(b), LOOKUP_FIELDS);
    assert.deepEqual(b, {
      request_id: id,
      status: "not_found",
      booking_reference: null,
      carrier: null,
      booked_at: null,
      as_of: "2018-05-20T10:00:00Z",
      synthetic: true,
      notice: NOTICE,
    });
  }
});

test("lookup value is percent-decoded once and matched case-sensitively; other params ignored", async () => {
  assert.equal((await body(send("/v1/bookings?request_id=request%2D11038&x=1"))).status, "booked");
  assert.equal((await body(send("/v1/bookings?Request_ID=request-11038&request_id=request-11045"))).status, "not_found");
  const upper = send("/v1/bookings?request_id=REQUEST-11038");
  assert.equal(upper.status, 400);
  assert.equal((await body(upper)).error.code, "invalid_request_id");
});

const NOTICE_TEXT =
  "Synthetic demo data from the DataTug carrier sandbox. No real carrier, booking or shipment.";

test("notice is the fixed spec string", () => {
  assert.equal(NOTICE, NOTICE_TEXT);
});

async function expectError(path, method, status, code) {
  const res = send(path, { method });
  assert.equal(res.status, status, `${method} ${path}`);
  assertLabelled(res);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  const text = await res.text();
  const b = JSON.parse(text);
  assert.deepEqual(Object.keys(b), ["synthetic", "notice", "error"]);
  assert.equal(b.synthetic, true);
  assert.equal(b.notice, NOTICE);
  assert.equal(b.error.code, code);
  assert.equal(typeof b.error.message, "string");
  return { res, text };
}

test("AC errors-shaped: codes, order and no echo", async () => {
  await expectError("/v1/bookings", "GET", 400, "missing_request_id");
  await expectError("/v1/bookings?request_id=", "GET", 400, "missing_request_id");
  await expectError("/v1/bookings?request_id=&request_id=request-1", "GET", 400, "ambiguous_request_id");
  const { text } = await expectError("/v1/bookings?request_id=%3Cscript%3E", "GET", 400, "invalid_request_id");
  assert.ok(!text.includes("<script>"));
  await expectError(`/v1/bookings?request_id=request-${"1".repeat(13)}`, "GET", 400, "invalid_request_id");
  await expectError("/v1/bookings?request_id=delivered", "GET", 400, "invalid_request_id");
  await expectError("/v1/bookings?request_id=request-11038%20", "GET", 400, "invalid_request_id");
  const { res } = await expectError("/v1/shipments", "POST", 405, "method_not_allowed");
  assert.equal(res.headers.get("allow"), "GET, HEAD, OPTIONS");
  await expectError("/v1/bookings?request_id=request-11038", "POST", 405, "method_not_allowed");
  await expectError("/v1/bookings", "DELETE", 405, "method_not_allowed");
  await expectError("/v1/shipments", "GET", 404, "unknown_path");
  await expectError("/v1/bookings/?request_id=request-11038", "GET", 404, "unknown_path");
  // 12 digits is the boundary: valid, not found.
  const ok = send(`/v1/bookings?request_id=request-${"1".repeat(12)}`);
  assert.equal(ok.status, 200);
  assert.equal((await body(ok)).status, "not_found");
});

test("AC browser-cors: preflight on known and unknown paths", async () => {
  for (const path of ["/v1/bookings?request_id=request-11038", "/nowhere"]) {
    const res = send(path, {
      method: "OPTIONS",
      headers: {
        Origin: "https://datatug.app",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "accept, x-custom",
      },
    });
    assert.equal(res.status, 204, path);
    assertLabelled(res);
    assert.equal(res.headers.get("access-control-allow-methods"), "GET, HEAD, OPTIONS");
    assert.equal(res.headers.get("access-control-allow-headers"), "*");
    assert.equal(res.headers.get("access-control-max-age"), "7200");
    assert.equal(await res.text(), "");
  }
});

test("AC success-headers: GET and HEAD agree; HEAD has no body", async () => {
  const get = send("/v1/bookings?request_id=request-11038");
  const head = send("/v1/bookings?request_id=request-11038", { method: "HEAD" });
  assert.equal(head.status, get.status);
  assert.deepEqual([...head.headers], [...get.headers]);
  assert.equal(get.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(get.headers.get("cache-control"), "public, max-age=300");
  assert.equal(await head.text(), "");
  const headErr = send("/v1/bookings", { method: "HEAD" });
  assert.equal(headErr.status, 400);
  assert.equal(await headErr.text(), "");
});

test("REQ service-description: GET / with version and no-store", async () => {
  const res = send("/");
  assert.equal(res.status, 200);
  assertLabelled(res);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await body(res), {
    synthetic: true,
    notice: NOTICE,
    service: "carrier-sandbox",
    version: SHA,
    as_of: "2018-05-20T10:00:00Z",
    statuses: ["booked", "not_found"],
    endpoints: ["/v1/bookings?request_id={request_id}"],
  });
  const dev = await worker.fetch(new Request(BASE + "/"), {});
  assert.equal((await body(dev)).version, "dev");
});

test("AC stateless: headers, cookies and origin do not change the response", async () => {
  const a = send("/v1/bookings?request_id=request-11038");
  const b = send("/v1/bookings?request_id=request-11038", {
    headers: { Cookie: "session=abc", "User-Agent": "Go-http-client/2.0", Origin: "https://example.org" },
  });
  assert.deepEqual([...a.headers], [...b.headers]);
  assert.equal(await a.text(), await b.text());
});

test("AC stateless: source reads only method and url and has no side channels", () => {
  for (const file of readdirSync(new URL("../src/", import.meta.url))) {
    // Line comments describe the rule; only code is checked.
    const src = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of [
      "request.headers",
      ".headers.get(",
      "request.cf",
      "request.body",
      "request.json",
      "request.text",
      "fetch(new",
      "await fetch",
      "caches.",
      "console.",
      "ctx.waitUntil",
      "Set-Cookie",
    ]) {
      assert.ok(!src.includes(forbidden), `${file} must not contain ${forbidden}`);
    }
  }
});

test("AC stateless: wrangler config is an allowlist", () => {
  const raw = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
  assert.deepEqual(Object.keys(config).sort(), [
    "$schema",
    "compatibility_date",
    "logpush",
    "main",
    "name",
    "observability",
    "preview_urls",
    "routes",
    "vars",
    "workers_dev",
  ]);
  assert.deepEqual(config.observability, { enabled: false });
  assert.equal(config.logpush, false);
  assert.deepEqual(config.vars, { VERSION: "dev" });
  assert.deepEqual(config.routes, [{ pattern: "carrier.demodb.dev", custom_domain: true }]);
});

const CORPUS = [
  ["/", "GET"],
  ["/v1/bookings?request_id=request-11038", "GET"],
  ["/v1/bookings?request_id=request-11045", "GET"],
  ["/v1/bookings", "GET"],
  ["/v1/bookings?request_id=a&request_id=b", "GET"],
  ["/v1/bookings?request_id=x", "GET"],
  ["/v1/shipments", "GET"],
  ["/", "POST"],
  ["/v1/bookings", "OPTIONS"],
];

test("AC synthetic-everywhere and no-movement-wording over the finite corpus", async () => {
  const forbidden = /shipped|transit|picked up|delivery|delivered|scan|tracking/i;
  for (const [path, method] of CORPUS) {
    const res = send(path, { method });
    assert.equal(res.headers.get("x-synthetic-data"), "true", `${method} ${path}`);
    const text = await res.text();
    assert.ok(!forbidden.test(text), `${method} ${path}: ${text}`);
    if (text) {
      const b = JSON.parse(text);
      assert.equal(b.synthetic, true);
      assert.equal(b.notice, NOTICE);
    }
  }
  const crash = await makeHandler(() => {
    throw new Error("boom");
  }).fetch(new Request(BASE + "/"), {});
  assert.ok(!forbidden.test(await crash.clone().text()));
});

test("AC unexpected-error-labelled: a thrown handler answers 500 internal_error", async () => {
  const res = makeHandler(() => {
    throw new Error("boom");
  }).fetch(new Request(BASE + "/v1/bookings?request_id=request-11038"), {});
  assert.equal(res.status, 500);
  assertLabelled(res);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const b = await body(res);
  assert.deepEqual(b, {
    synthetic: true,
    notice: NOTICE,
    error: { code: "internal_error", message: "Unexpected error in the carrier sandbox." },
  });
});
