# carrier-sandbox

A static, public, read-only carrier booking lookup for the DataTug public demo, served by a
Cloudflare Worker at **https://carrier.demodb.dev**.

**All data is synthetic.** There is no real carrier, booking or shipment. Every response carries
`X-Synthetic-Data: true` and a `synthetic`/`notice` pair in its JSON body.

```console
$ curl -s 'https://carrier.demodb.dev/v1/bookings?request_id=request-11038'
{"request_id":"request-11038","status":"booked","booking_reference":"booking-11038","carrier":"united-package","booked_at":"2018-04-30T09:00:04Z","as_of":"2018-05-20T10:00:00Z","synthetic":true,"notice":"Synthetic demo data from the DataTug carrier sandbox. No real carrier, booking or shipment."}
```

`status` is `booked` or `not_found`. The records mirror the baseline of the DataTug demo shipping
fixture (`datatug/datatug-demo-project`, `demo-project-1/fixtures/shipping`): `request-11038` is
booked; `request-11045`, `request-11062` and every other id are `not_found`. The sandbox holds no
visitor state and never reflects a visitor's training copy or replay.

The response contract (endpoint, fields, errors, CORS, caching, statelessness) is the SpecScore
feature [`spec/features/carrier-booking-lookup`](spec/features/carrier-booking-lookup/README.md).

## Develop

```sh
npm ci
npm test                       # unit tests; set FIXTURE_SHIPPING_DIR to also check the fixture
npx wrangler dev               # local Worker
```

## Deploy

A push to `main` runs the tests, deploys with `node scripts/deploy.mjs` (the commit SHA becomes
`version` on `GET /`), and verifies the live host with `scripts/smoke-live.mjs` from a GitHub-hosted
runner. Pull requests never deploy; they check the live host's reachability. The Cloudflare token
needs Account > Workers Scripts: Edit and, on `demodb.dev`, Zone > Workers Routes: Edit, DNS: Edit
and Zone: Read.
