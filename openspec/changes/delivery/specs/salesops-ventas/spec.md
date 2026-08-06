# Delta for salesops-ventas (AMENDMENT, not append)

**Merge target**: `openspec/specs/salesops-ventas/spec.md`. This document
AMENDS that promoted spec's "Order Delivery Mode" requirement in place. The
shipped text asserts that the future Delivery module "inserts `verified →
despachando → transportando → delivered`" and that a scenario's premise is
"(Delivery module not yet built)". Both are now FALSE: the `delivery` change
ships Delivery, and the owner decided `OrderStatus` keeps exactly its current
4 states — the in-transit lifecycle lives entirely on
`DeliveryAssignment.status` (`salesops-delivery`), never on `Order`. This
amendment corrects both the requirement prose and the stale-premise scenario;
it does NOT append a new requirement and leave the old one standing.

## MODIFIED Requirements

### Requirement: Order Delivery Mode

`Order` MUST carry a required `deliveryMode: 'pickup' | 'delivery'` field.
Sales implements exactly ONE fulfillment edge for `Order.status`, used by
BOTH delivery modes: `verified → delivered`, direct, with no intermediate
state on `Order`. `OrderStatus` remains exactly 4 states
(`created | verified | delivered | cancelled`) regardless of `deliveryMode`.

For `deliveryMode='delivery'` orders, the in-transit lifecycle between
`verified` and `delivered` is modelled entirely by `salesops-delivery`'s
`DeliveryAssignment.status` (`in_transit | delivered`) — a SEPARATE record
bridging the order to a carrier, never a state or column on `Order` itself.
Sales never models `despachando`/`transportando` as an `Order` state; Delivery
drives `Order.status` to `delivered` by calling into Sales' own
`OrderService.deliver()` through a port Delivery declares
(`IOrderDeliveryGateway`), which Sales implements — Sales remains the sole
owner of `Order.status` in every case.

(Previously: "When `deliveryMode='delivery'`, fulfillment continues through a
FUTURE Delivery module (out of scope for this slice) that inserts `verified →
despachando → transportando → delivered`; Sales itself never models
`despachando`/`transportando` and only ever implements the direct `verified →
delivered` edge regardless of `deliveryMode`." Superseded by `delivery`: the
module is no longer future/out of scope, and — critically — it does NOT
insert `despachando`/`transportando` into `Order` at all. That in-transit
lifecycle lives exclusively on `DeliveryAssignment`, a Delivery-owned record,
never on `Order`.)

#### Scenario: deliveryMode is required on creation

- GIVEN an order payload with no `deliveryMode`
- WHEN the order is created
- THEN the system MUST reject it with `InvalidOrderError`

#### Scenario: pickup orders transition directly to delivered

- GIVEN a `verified` order with `deliveryMode='pickup'`
- WHEN it is marked delivered
- THEN it transitions directly to `delivered`

#### Scenario: delivery orders use the same direct Sales edge, now with Delivery ships

- GIVEN a `verified` order with `deliveryMode='delivery'`
- WHEN it reaches `delivered`, whether via `POST /orders/:id/deliver` directly
  or via Delivery's `IOrderDeliveryGateway.markOrderDelivered` call after a
  `DeliveryAssignment` is marked delivered
- THEN `Order.status` transitions via the SAME direct `verified → delivered`
  edge Sales has always implemented — no `despachando`/`transportando` state
  exists on `Order`, ever, for either delivery mode

(Previously: "GIVEN a `verified` order with `deliveryMode='delivery'` / WHEN
inspected under this slice (Delivery module not yet built) / THEN Sales
exposes only the direct `verified → delivered` transition — no
`despachando`/`transportando` state exists on `Order` in this slice." The
premise "Delivery module not yet built" is stale as of `delivery`; the
scenario's substantive assertion — no `despachando`/`transportando` on
`Order` — remains TRUE and is restated above without the stale premise.)
