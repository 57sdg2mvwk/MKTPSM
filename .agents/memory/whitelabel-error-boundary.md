---
name: Whitelabel error boundary
description: Rules for keeping upstream service terminology and diagnostics out of AMD's public interface.
---

Any text, schema field, request payload, response, rendered error, or production browser bundle that can reach a panel user must use neutral AMD terminology. Upstream service names, URLs, endpoint terminology, raw errors, and internal identifiers remain server-only.

**Why:** A whitelabel panel must not disclose implementation partners or operational details, including when upstream balance, availability, parsing, or connectivity fails.

**How to apply:** Map public errors to an allowlist of approved neutral messages, use a generic server error fallback, avoid rendering raw transport errors, and scan the final client build plus public API contract before publishing. Keep upstream identifiers limited to private server storage and transport.

Social sharing metadata follows the same boundary: titles, descriptions, canonical URLs, Open Graph/Twitter cards, favicons, and share images must identify AMD Marketing Digital only. Private panel pages use `noindex` and `nofollow`.