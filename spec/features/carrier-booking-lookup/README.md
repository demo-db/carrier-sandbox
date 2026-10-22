---
format: https://specscore.md/feature-specification
status: Implementing
---

# Feature: Carrier booking lookup

> [SpecScore.**Studio**](https://specscore.studio): | [Explore](https://specscore.studio/app/github.com/demo-db/carrier-sandbox/spec/features/carrier-booking-lookup?op=explore) | [Edit](https://specscore.studio/app/github.com/demo-db/carrier-sandbox/spec/features/carrier-booking-lookup?op=edit) | [Ask question](https://specscore.studio/app/github.com/demo-db/carrier-sandbox/spec/features/carrier-booking-lookup?op=ask) | [Request change](https://specscore.studio/app/github.com/demo-db/carrier-sandbox/spec/features/carrier-booking-lookup?op=request-change) |
**Status:** Implementing
**Source Ideas:** —

## Summary

A static, public, read-only HTTPS lookup that answers whether the synthetic carrier holds a booking for a Shipping request id.

## Problem

Act 3 of the DataTug public demo ("where is my order?") asks the carrier about a Shipping request. That
needs a business HTTP endpoint distinct from the OVDB transport, reachable anonymously from a browser
(CORS) and from the DataTug server runner (public HTTPS, so its SSRF guard admits it). No real carrier
may be called, and the answer must never look like real data or like evidence about the visitor's own
training copy. The owning requirements are `REQ:business-http-carrier-sandbox` and
`REQ:synthetic-disclosure` of the `public-demo` feature in `datatug/backstage`.

## Behavior

Base URL: `https://carrier.demodb.dev`. All data is fictional; `united-package` is the demo's fictional
carrier id, and every response says the data is synthetic.

The sandbox is a **frozen baseline**: it answers as the fictional carrier's read side stood at the demo
business clock `2018-05-20T10:00:00Z`, before any visitor's correction or replay. It accepts no writes.
The demo's carrier-gateway log stream describes the shipping system's own simulated outbound booking
calls; those calls are log records only and are not served or accepted by this sandbox.

### REQ: booking-lookup-endpoint

`GET /v1/bookings?request_id=<id>` looks up the carrier's booking for one Shipping `request_id`. `HEAD`
on any `GET` URL returns the same status and headers with no body. The query string is parsed with
`URLSearchParams` semantics (each value percent-decoded once, `+` decoded as a space). The parameter
name is exactly `request_id` (any other spelling, such as `Request_ID`, is an unrelated parameter and
is ignored). The value is valid only when it matches `^request-[0-9]{1,12}$`, the shape of every
Shipping request id; it is then matched case-sensitively. Other query parameters are ignored. The only
other resource is `GET /` (and `HEAD /`), the service description. Any other path returns 404
`unknown_path`, including `/v1/bookings/` with a trailing slash.

### REQ: booking-response

A valid lookup always answers `200` with one flat JSON object. Fields, all always present, in this
order:

| Field | Type | `booked` | `not_found` |
|---|---|---|---|
| `request_id` | string | the queried id | the queried id |
| `status` | string | `booked` | `not_found` |
| `booking_reference` | string or null | e.g. `booking-11038` | null |
| `carrier` | string or null | `united-package` | null |
| `booked_at` | string or null | RFC 3339 UTC, second precision | null |
| `as_of` | string | `2018-05-20T10:00:00Z` | `2018-05-20T10:00:00Z` |
| `synthetic` | boolean | `true` | `true` |
| `notice` | string | the synthetic notice | the synthetic notice |

`not_found` means only "this carrier holds no booking for that request id"; the sandbox does not know
which request ids exist, so a well-formed id it has never heard of is also `not_found`. The status
vocabulary is exactly `booked` and `not_found`. No field name, status, error message or notice uses
words that imply the package moved or was handled (shipped, in transit, picked up, out for delivery,
delivered, scanned, tracking); `booked` means only that a booking exists. Because a valid
`request_id` is `request-` plus digits, a reflected id cannot introduce such words either.

The synthetic notice is the fixed string `Synthetic demo data from the DataTug carrier sandbox. No real
carrier, booking or shipment.` In the DataTug result view the `notice` value is the visible synthetic
label (the header is visible only on the Headers tab), so every JSON body carries it.

### REQ: records

The records are compiled into the Worker and change only by a reviewed commit and redeploy. They
mirror the baseline of the DataTug demo shipping fixture (`datatug/datatug-demo-project`,
`demo-project-1/fixtures/shipping/`, synthetic clock `synthetic-shipping-utc`):

| request_id | status | booking_reference | carrier | booked_at |
|---|---|---|---|---|
| `request-11038` | `booked` | `booking-11038` | `united-package` | `2018-04-30T09:00:04Z` |

`booked_at` equals the fixture's `assignment-11038` `accepted_at` and the `assignment-accepted` event of
`attempt-11038-1` in `logs/base.jsonl`; `booking_reference` equals the `booking-confirmed` event of the
baseline `logs/carrier-gateway.jsonl` stream once that stream lands (see Dependencies). Every other id,
including `request-11045`, `request-11062` and the controls `request-90001` to `request-90005`, is
`not_found`. Bookings that appear only in a per-request recovery artifact after a visitor's correction
and replay (`booking-11045`, `booking-11062`) are never served: replay proof comes from the training
copy and its recovery artifact, never from the sandbox, and every response is identical before and
after any visitor's replay.

### REQ: no-visitor-state

The sandbox holds no visitor state and observes nothing about a visitor or a training copy. This is an
allowlist: the Wrangler configuration declares no bindings of any kind (no KV, D1, R2, Durable Objects,
Queues, Analytics Engine, service bindings, Hyperdrive, AI, vars other than the build `VERSION`), no
`tail_consumers` and no Logpush, and sets `observability.enabled` to `false`. The Worker makes no
subrequests, does not use the Cache API, does not log, sets no cookies and reads nothing from the
request except the method and URL (no headers, no body, no `request.cf`). A response depends only on
the method, the path and the `request_id` value.

### REQ: synthetic-label

Every response the Worker produces, including errors, the service description and preflight, carries
the header `X-Synthetic-Data: true`. Every JSON body carries `"synthetic": true` and the `notice`
string at the top level. Responses generated by the Cloudflare platform itself without running the
Worker are out of scope here and are governed by `REQ:platform-reachability`.

### REQ: cors

Every Worker response carries `Access-Control-Allow-Origin: *` and
`Access-Control-Expose-Headers: X-Synthetic-Data`. `OPTIONS` on any path, known or unknown, is a
preflight answer: `204`, no body, `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`,
`Access-Control-Allow-Headers: *` (echoing nothing from the request), `Access-Control-Max-Age: 7200`
(the Chromium cap). The sandbox never sends `Access-Control-Allow-Credentials`, so browsers send no
cookies or credentials with CORS requests.

### REQ: headers-and-caching

JSON responses use `Content-Type: application/json; charset=utf-8`, and every Worker response carries
`X-Content-Type-Options: nosniff`. A `200` lookup response carries `Cache-Control: public, max-age=300`.
The service description (`GET /`) and every error response carry `Cache-Control: no-store`, so a
deployment check always reads the live version. The preflight relies on `Access-Control-Max-Age`.

### REQ: errors

Errors use one shape: `{"synthetic": true, "notice": "<notice>", "error": {"code": "<code>",
"message": "<fixed text>"}}`. Each message is a fixed string per code and never echoes request input.
Checks run in this order and the first failure answers:

| Order | Condition | Status | `error.code` |
|---|---|---|---|
| 1 | method is not `GET`, `HEAD` or `OPTIONS` (on any path) | 405 | `method_not_allowed`, with `Allow: GET, HEAD, OPTIONS` |
| 2 | path is not `/` or `/v1/bookings` | 404 | `unknown_path` |
| 3 | `request_id` given more than once (even if one is empty) | 400 | `ambiguous_request_id` |
| 4 | `request_id` absent or empty | 400 | `missing_request_id` |
| 5 | `request_id` does not match `^request-[0-9]{1,12}$` | 400 | `invalid_request_id` |
| — | an unexpected exception inside the Worker | 500 | `internal_error` |

`OPTIONS` is answered as a preflight before checks 2–5.

### REQ: service-description

`GET /` answers `200` with `synthetic`, `notice`, `service` (`carrier-sandbox`), `version`, `as_of`,
`statuses` (`["booked", "not_found"]`) and `endpoints` (`["/v1/bookings?request_id={request_id}"]`).
`version` is the full 40-character Git commit SHA the deploy was built from, injected by the deploy as
the `VERSION` var. Production deploys go through `scripts/deploy.mjs`, which refuses unless `VERSION`
is the full SHA of the checked-out, clean `HEAD`; `dev` (the configured default) is for local `wrangler
dev` and tests only.

### REQ: platform-reachability

`carrier.demodb.dev` is served by the Worker with no Cloudflare challenge in front of it: a request
from a non-browser client (the DataTug server runner, curl) with no `Origin` and no cookies gets the
Worker's JSON, not a challenge or HTML page. Platform-generated errors (Cloudflare 52x/1xxx pages) are
outside the Worker's control and are not labelled; the Worker itself never lets an exception escape
(see `internal_error`). The Worker never sets `NEL` or `Report-To`; the zone-level Cloudflare Network
Error Logging that `demodb.dev` currently adds is governed by the open question below.

## Dependencies

- `datatug/backstage` feature `public-demo` (owning requirements and acceptance).
- `datatug/datatug-demo-project` shipping fixture: `assignment-11038` and `logs/base.jsonl` (landed);
  `logs/carrier-gateway.jsonl` with `booking-11038` (public-demo Task 2, landing in parallel).
- Consumer: the saved HTTP query `shipping/carrier-status` in `datatug/datatug-demo-project` (added in
  the same task as this repository), run by the
  parameterised-HTTP runtime of `datatug/datatug-apps` (spec PR #505).

## Not Doing

- Writes of any kind: creating, changing or cancelling bookings; `POST /v1/bookings`.
- Authentication, accounts, API keys, rate limiting beyond Cloudflare defaults.
- Tracking events, package locations or any delivery lifecycle.
- Reflecting any visitor's training copy or replay.

## Acceptance Criteria

### AC: booked-record (verifies REQ:booking-lookup-endpoint, REQ:booking-response, REQ:records)

**Given** the deployed sandbox
**When** `GET /v1/bookings?request_id=request-11038` is requested
**Then** it answers 200 with exactly the fields of `REQ:booking-response` in order: `request_id: request-11038`, `status: booked`, `booking_reference: booking-11038`, `carrier: united-package`, `booked_at: 2018-04-30T09:00:04Z`, `as_of: 2018-05-20T10:00:00Z`, `synthetic: true` and the notice.

### AC: no-booking (verifies REQ:booking-response, REQ:records)

**Given** the deployed sandbox
**When** `request-11045`, `request-11062`, `request-90001` or `request-99999` is looked up
**Then** each answers 200 with `status: not_found`, null `booking_reference`, `carrier` and `booked_at`, the `as_of`, `synthetic: true` and the notice.

### AC: records-match-fixture (verifies REQ:records)

**Given** the `datatug/datatug-demo-project` main branch
**When** this repository's fixture-consistency test runs
**Then** the compiled `booked_at` equals the `assignment-accepted` event of `attempt-11038-1` in `logs/base.jsonl`; no record other than `request-11038` is compiled; and whenever the fixture `manifest.json` declares a `baseline` `carrierGatewayLogs` stream, the check is mandatory: its `booking-confirmed` events book exactly the compiled requests with the same `booking_reference`, `carrier` and `occurred_at`.

### AC: replay-invariant (verifies REQ:records, REQ:no-visitor-state)

**Given** a lookup for `request-11045`
**When** it is sent before and after a visitor corrects and replays 11045 in a training copy
**Then** the two response bodies are byte-identical and say `not_found`.

### AC: synthetic-everywhere (verifies REQ:synthetic-label)

**Given** each request of the finite corpus: `GET /`, a booked and a not-found lookup, every error code of `REQ:errors`, and a preflight
**When** the response is read
**Then** it carries `X-Synthetic-Data: true`, and every JSON body has `synthetic: true` and the notice.

### AC: browser-cors (verifies REQ:cors)

**Given** a page on another origin
**When** it sends a preflight `OPTIONS` with `Access-Control-Request-Headers: accept, x-custom` to `/v1/bookings` and to `/nowhere`, and then a `GET` lookup
**Then** both preflights answer 204 with the allowed methods, `Allow-Headers: *` and `Max-Age: 7200`, the `GET` carries `Access-Control-Allow-Origin: *` and exposes `X-Synthetic-Data`, and no response carries `Access-Control-Allow-Credentials`.

### AC: errors-shaped (verifies REQ:errors, REQ:headers-and-caching)

**Given** a lookup with no `request_id`, `?request_id=&request_id=request-1`, `request_id=<script>`, `request_id=request-` followed by 13 digits, a `POST /v1/shipments`, a `GET /v1/shipments` and a `GET /v1/bookings/?request_id=request-11038`
**When** each is sent
**Then** they answer 400 `missing_request_id`, 400 `ambiguous_request_id`, 400 `invalid_request_id` (body not containing `<script>`), 400 `invalid_request_id`, 405 `method_not_allowed` with `Allow`, 404 `unknown_path` and 404 `unknown_path`, each with `Cache-Control: no-store`, the error shape and the synthetic label; and `request-` followed by 12 digits answers 200 `not_found`.

### AC: success-headers (verifies REQ:headers-and-caching, REQ:booking-lookup-endpoint)

**Given** a booked lookup sent with `GET` and with `HEAD`
**When** the responses are read
**Then** both carry the same status and headers including `Content-Type: application/json; charset=utf-8`, `X-Content-Type-Options: nosniff` and `Cache-Control: public, max-age=300`, and the `HEAD` response has no body.

### AC: stateless (verifies REQ:no-visitor-state)

**Given** the Wrangler configuration and the Worker source
**When** they are inspected, and the same lookup is sent with different cookies, `User-Agent` and `Origin` headers
**Then** there are no bindings, tail consumers or Logpush, observability is disabled, the source makes no subrequest and reads no header, no response sets a cookie, and the response bodies and Worker-set headers are byte-identical (platform headers `Date`, `CF-Ray`, `Server`, `alt-svc` and `cf-cache-status` excluded).

### AC: no-movement-wording (verifies REQ:booking-response)

**Given** the finite corpus of `AC:synthetic-everywhere`
**When** every response body is searched case-insensitively for shipped, transit, picked up, delivery, delivered, scan and tracking
**Then** no match is found.

### AC: unexpected-error-labelled (verifies REQ:errors, REQ:synthetic-label)

**Given** the Worker handler throws unexpectedly (forced in a unit test)
**When** the response is read
**Then** it is 500 `internal_error` in the error shape with the synthetic label, CORS headers and `Cache-Control: no-store`.

### AC: service-description-fields (verifies REQ:service-description, REQ:headers-and-caching)

**Given** the Worker with `VERSION` set to a commit SHA, and without it
**When** `GET /` is requested
**Then** it answers 200 with exactly `synthetic`, `notice`, `service: carrier-sandbox`, `version` (the SHA, or `dev` without it), `as_of: 2018-05-20T10:00:00Z`, `statuses: ["booked","not_found"]` and `endpoints: ["/v1/bookings?request_id={request_id}"]`, and `Cache-Control: no-store`.

### AC: public-https (verifies REQ:service-description, REQ:platform-reachability)

**Given** the sandbox deployed to `carrier.demodb.dev`
**When** `GET https://carrier.demodb.dev/` and lookups are requested with no `Origin` and no cookies, both from a workstation (curl) and from a datacenter host (the CI smoke job on GitHub-hosted runners)
**Then** each answers JSON from the Worker (no challenge page) over a publicly trusted certificate, `version` is the deployed 40-character commit SHA, and no `Set-Cookie` header is present.

## Open Questions

- **Zone-level Network Error Logging.** Cloudflare adds `NEL` and `Report-To` (failure reports only,
  `success_fraction: 0.0`) to every `demodb.dev` response, so a visitor's browser may report a failed
  request (URL and network details) to Cloudflare. The Worker cannot remove these headers; turning NEL
  off is a zone-wide setting for every `demodb.dev` host. Recommend turning it off for the zone; the
  founder decides. Until then the live smoke check reports their presence as a warning.

---
*This document follows the https://specscore.md/feature-specification*
