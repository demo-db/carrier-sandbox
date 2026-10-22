// Carrier sandbox: a static, read-only, synthetic carrier booking lookup.
// Contract: spec/features/carrier-booking-lookup/README.md
//
// The handler reads only request.method and request.url (REQ:no-visitor-state): no headers,
// no body, no request.cf, no subrequests, no logging, no storage.

import { AS_OF, BOOKINGS } from "./records.js";

export const NOTICE =
  "Synthetic demo data from the DataTug carrier sandbox. No real carrier, booking or shipment.";

export const REQUEST_ID_PATTERN = /^request-[0-9]{1,12}$/;

const ALLOW = "GET, HEAD, OPTIONS";
const LOOKUP_PATH = "/v1/bookings";

const ERROR_MESSAGES = Object.freeze({
  method_not_allowed: "Only GET, HEAD and OPTIONS are supported.",
  unknown_path: "Unknown path. Use GET /v1/bookings?request_id={request_id}.",
  ambiguous_request_id: "Give request_id exactly once.",
  missing_request_id: "The request_id query parameter is required.",
  invalid_request_id: "request_id must look like request-<digits> (at most 12 digits).",
  internal_error: "Unexpected error in the carrier sandbox.",
});

function baseHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "X-Synthetic-Data",
    "X-Synthetic-Data": "true",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(status, body, cacheControl, extraHeaders = {}, head = false) {
  const headers = {
    ...baseHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheControl,
    ...extraHeaders,
  };
  return new Response(head ? null : JSON.stringify(body), { status, headers });
}

function error(status, code, extraHeaders = {}, head = false) {
  return json(
    status,
    { synthetic: true, notice: NOTICE, error: { code, message: ERROR_MESSAGES[code] } },
    "no-store",
    extraHeaders,
    head,
  );
}

function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      ...baseHeaders(),
      "Access-Control-Allow-Methods": ALLOW,
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "7200",
    },
  });
}

/** Looks up one valid request id. Returns the flat booking-response object (REQ:booking-response). */
export function lookup(requestId) {
  const booking = BOOKINGS.get(requestId);
  return {
    request_id: requestId,
    status: booking ? "booked" : "not_found",
    booking_reference: booking ? booking.booking_reference : null,
    carrier: booking ? booking.carrier : null,
    booked_at: booking ? booking.booked_at : null,
    as_of: AS_OF,
    synthetic: true,
    notice: NOTICE,
  };
}

function serviceDescription(version) {
  return {
    synthetic: true,
    notice: NOTICE,
    service: "carrier-sandbox",
    version,
    as_of: AS_OF,
    statuses: ["booked", "not_found"],
    endpoints: [`${LOOKUP_PATH}?request_id={request_id}`],
  };
}

/**
 * Routes one request. Check order follows REQ:errors: method, preflight, path, then request_id.
 * @param {string} method
 * @param {string} rawUrl
 * @param {string} version
 */
export function route(method, rawUrl, version) {
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    return error(405, "method_not_allowed", { Allow: ALLOW });
  }
  if (method === "OPTIONS") return preflight();
  const head = method === "HEAD";
  const url = new URL(rawUrl);
  if (url.pathname === "/") {
    return json(200, serviceDescription(version), "no-store", {}, head);
  }
  if (url.pathname !== LOOKUP_PATH) return error(404, "unknown_path", {}, head);
  const values = url.searchParams.getAll("request_id");
  if (values.length > 1) return error(400, "ambiguous_request_id", {}, head);
  if (values.length === 0 || values[0] === "") return error(400, "missing_request_id", {}, head);
  const requestId = values[0];
  if (!REQUEST_ID_PATTERN.test(requestId)) return error(400, "invalid_request_id", {}, head);
  return json(200, lookup(requestId), "public, max-age=300", {}, head);
}

/**
 * Wraps a router so an unexpected exception still answers in the labelled error shape.
 * @param {(method: string, rawUrl: string, version: string) => Response} router
 */
export function makeHandler(router) {
  return {
    /** @param {Request} request @param {{VERSION?: string}} env */
    fetch(request, env) {
      try {
        return router(request.method, request.url, (env && env.VERSION) || "dev");
      } catch {
        return error(500, "internal_error");
      }
    },
  };
}

export default makeHandler(route);
