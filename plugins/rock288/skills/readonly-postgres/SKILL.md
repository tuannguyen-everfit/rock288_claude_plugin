---
name: rk:readonly-postgres
description: "Execute read-only PostgreSQL queries safely with validation, timeouts, and result formatting. Use for database exploration, debugging, and data analysis."
argument-hint: "[query or question about data]"
---

# Read-Only PostgreSQL

Safe, read-only PostgreSQL queries with strict validation.

## Safety Rules

1. **ONLY SELECT statements** — NEVER execute INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE
2. **Always use timeouts** — Default 30 seconds max
3. **Always LIMIT results** — Default LIMIT 100 unless user specifies otherwise
4. **Never expose credentials** — Use environment variables or connection strings from .env
5. **Wrap in transactions** — Use `SET TRANSACTION READ ONLY`

## Workflow

### Step 1: Find Connection

Check for database connection in order:
1. `DATABASE_URL` environment variable
2. `.env` file with `DATABASE_URL` or `POSTGRES_*` variables
3. Docker compose files with postgres service
4. Ask user for connection string

### Step 2: Validate Query

Before execution, verify:
- Query starts with `SELECT`, `WITH`, `EXPLAIN`, or `SHOW`
- No write operations hidden in CTEs or subqueries
- No function calls that modify data (`nextval`, `setval`, `pg_notify`, etc.)
- Has LIMIT clause (add `LIMIT 100` if missing)

### Step 3: Execute

```bash
psql "$DATABASE_URL" -c "SET statement_timeout = '30s'; SET TRANSACTION READ ONLY; <QUERY>" --csv
```

Or with formatting:
```bash
psql "$DATABASE_URL" -c "SET statement_timeout = '30s'; SET TRANSACTION READ ONLY; <QUERY>" --expanded
```

### Step 4: Present Results

- Format as markdown table for small results
- Summarize for large result sets
- Include row count and execution time
- Suggest follow-up queries if relevant

## Common Queries

| Task | Query |
|------|-------|
| List tables | `SELECT tablename FROM pg_tables WHERE schemaname = 'public'` |
| Table schema | `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '<table>'` |
| Table size | `SELECT pg_size_pretty(pg_total_relation_size('<table>'))` |
| Row counts | `SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC` |
| Active queries | `SELECT pid, state, query, query_start FROM pg_stat_activity WHERE state != 'idle'` |
| Index usage | `SELECT indexrelname, idx_scan, idx_tup_read FROM pg_stat_user_indexes ORDER BY idx_scan DESC` |
| Slow queries | `SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10` |
