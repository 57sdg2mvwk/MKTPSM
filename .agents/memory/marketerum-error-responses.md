---
name: Marketerum error responses
description: How Marketerum communicates application-level failures despite successful HTTP status codes.
---

Treat a Marketerum response object with an `error` field as a failed provider operation, even when the HTTP response is `200`.

**Why:** The provider returns payloads such as `{"error":"Incorrect order ID"}` for invalid status, refill, and service requests. Treating those as successes can incorrectly update local order progress or disable refill availability.

**How to apply:** Centralize this check in the provider client so add, status, and refill all throw before any local database update. Keep the client-facing response generic while retaining the unchanged local order for retry.