---
name: Provider status settlement
description: Rules for reconciling provider order states with the local credit ledger.
---

Treat `Completado`, `Parcial`, `Cancelado`, and `Reembolso` as terminal outcomes. A partial order reconciles the reservation to the charge explicitly returned by the provider; never estimate a partial refund when that charge is absent.

`Cancelado` and `Reembolso` release the full outstanding local cost exactly once. The provider-release ledger entry is the idempotency guard, so polling the same terminal status repeatedly must not create additional credit.

**Why:** Provider status polling is repeated, and a duplicate reversal would let an account spend more than its assigned credit.

**How to apply:** Any new provider status path must normalize to the canonical terminal states and use the same settlement rule before changing order cost or credit balance.