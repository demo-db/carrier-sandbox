// AC records-match-fixture: the compiled records agree with the DataTug demo shipping fixture.
// Set FIXTURE_SHIPPING_DIR to a checkout's demo-project-1/fixtures/shipping directory (CI checks
// out datatug/datatug-demo-project main). Without it the fixture checks are skipped.
//
// The carrier-gateway check is required as soon as the fixture manifest declares a baseline
// carrier-gateway stream, so it turns itself on when that stream lands.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { BOOKINGS } from "../src/records.js";

const dir = process.env.FIXTURE_SHIPPING_DIR;
const skip = !dir && "FIXTURE_SHIPPING_DIR unset";

function readJsonl(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

test("only request-11038 is compiled", () => {
  assert.deepEqual([...BOOKINGS.keys()], ["request-11038"]);
});

test("booked_at equals the baseline assignment-accepted event", { skip }, () => {
  const events = readJsonl(join(dir, "logs", "base.jsonl")).filter(
    (e) => e.attempt_id === "attempt-11038-1" && e.kind === "assignment-accepted",
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].synthetic, true);
  assert.equal(BOOKINGS.get("request-11038").booked_at, events[0].occurred_at);
});

test("records equal the baseline carrier-gateway booking-confirmed events", { skip }, (t) => {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const baseline = (manifest.carrierGatewayLogs ?? []).filter((s) => s.classification === "baseline");
  if (baseline.length === 0) {
    t.diagnostic("fixture manifest declares no baseline carrier-gateway stream yet; booking_reference unchecked");
    return;
  }
  const confirmed = baseline
    .flatMap((s) => readJsonl(join(dir, s.path)))
    .filter((e) => e.kind === "booking-confirmed");
  assert.deepEqual(
    confirmed.map((e) => e.request_id).sort(),
    [...BOOKINGS.keys()].sort(),
    "the baseline stream and the sandbox must book the same requests",
  );
  for (const e of confirmed) {
    const b = BOOKINGS.get(e.request_id);
    assert.equal(e.booking_status, "booked");
    assert.equal(b.booking_reference, e.booking_reference);
    assert.equal(b.carrier, e.carrier);
    assert.equal(b.booked_at, e.occurred_at);
  }
});
