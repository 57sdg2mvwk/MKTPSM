---
name: Supabase connectivity
description: External Supabase PostgreSQL setup requires validating DNS reachability before schema push or bootstrap.
---

For Supabase connections in this workspace, prefer the Session pooler URI when the direct database hostname is not reachable from the runtime; validate the configured hostname before running schema synchronization or seeding authentication data.

**Why:** A syntactically valid direct connection string can still point to a hostname that does not resolve from the workspace, while the Session pooler provides an IPv4-friendly route.

**How to apply:** Test a parameter-free `select 1` using the server package, keep public errors generic, and do not claim tables or users were created until the connection succeeds.