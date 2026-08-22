---
name: Provider order reservations
description: Safety rule for paid provider orders when database and provider outcomes cannot share a transaction.
---

Create a durable local credit reservation before submitting a paid provider order. A retry for an existing reservation must never submit the provider order again.

**Why:** A provider may accept an order even when the network response or subsequent database write is ambiguous. Releasing credit or re-sending in that state can create duplicate external purchases.

**How to apply:** Revert credit only after an explicit provider rejection. Keep transport failures, invalid provider payloads, and local-finalization failures in a visible pending-verification state that blocks a second order until resolved. Provide a user-scoped reconciliation path to attach a manually verified provider ID or explicitly release a reservation verified as not created.

After the local reservation commits, dispatch the external confirmation asynchronously and return the accepted order immediately. Do not show manual reconciliation during a short confirmation grace period.

**Why:** Remote confirmations can be slow while the local reservation is already safe and durable; making the user wait creates a misleading blocked state without improving duplicate-order safety.

**How to apply:** Keep the first submission bound to its idempotency key, transition the order when confirmation arrives, release only explicit rejections, and surface reconciliation only after the grace period or a confirmed ambiguous outcome.