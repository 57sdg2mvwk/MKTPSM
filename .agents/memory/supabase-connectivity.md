---
name: Supabase connectivity
description: External Supabase PostgreSQL setup requires validating DNS reachability before schema push or bootstrap.
---

Validate the configured Supabase hostname from the API environment before running Drizzle schema synchronization or seeding authentication data.

**Why:** A syntactically valid connection string can still point to a hostname that does not resolve from the workspace, leaving the app running but all database-backed routes unavailable.

**How to apply:** Test a parameter-free `select 1` using the server package, keep public errors generic, and do not claim tables or users were created until the connection succeeds.