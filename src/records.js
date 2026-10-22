// Synthetic carrier records: the frozen baseline of the DataTug demo shipping fixture
// (datatug/datatug-demo-project, demo-project-1/fixtures/shipping). See
// spec/features/carrier-booking-lookup/README.md REQ:records. Only bookings that exist in the
// baseline are listed; every other request id is "not_found". Recovery-only bookings
// (booking-11045, booking-11062) are deliberately absent.

/** The demo business clock the baseline is frozen at. */
export const AS_OF = "2018-05-20T10:00:00Z";

/** @type {ReadonlyMap<string, {booking_reference: string, carrier: string, booked_at: string}>} */
export const BOOKINGS = new Map([
  [
    "request-11038",
    Object.freeze({
      booking_reference: "booking-11038",
      carrier: "united-package",
      booked_at: "2018-04-30T09:00:04Z",
    }),
  ],
]);
