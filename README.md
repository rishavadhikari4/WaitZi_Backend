# WaitZi Backend

Multi-tenant restaurant management API: QR ordering, kitchen queue, tables, payments (cash, card, Fonepay, NepalPay, Khalti) and live dashboards. Many restaurants share one deployment, and none can see another's data.

**Stack:** TypeScript · Express 5 · PostgreSQL 18 · Prisma 7 · Socket.IO · zod · Vitest

## Quick start

```bash
npm install                  # also generates the Prisma client
cp .env.example .env         # fill in JWT secrets etc.
npm run db:up                # Postgres 18 in Docker on localhost:5434
npm run db:migrate           # schema, row-level security, triggers
npm run db:seed              # demo restaurant + super admin (dev passwords in prisma/seed.ts)
npm run dev                  # http://localhost:8080
```

```bash
npm test                     # 125 tests against a throwaway database
npm run typecheck
npm run build && npm start   # compiled output in dist/
```

## How it's put together

```
server.ts                    HTTP server, Socket.IO, order timeout sweep
src/
  app.ts                     middleware + /api routes
  config/                    env (config.ts), Prisma clients (prisma.ts), uploads
  routes/                    index → auth | client | public, then component/<domain>/<audience>
  controllers/               HTTP in/out only (extend BaseController)
  services/                  business rules; open withTenant() transactions
  repository/                the only layer that talks to Prisma
  validators/                zod schemas, applied in routes
  middleware/                auth, permissions, validation, rate limits
  providers/payment/         Khalti client
  jobs/scheduler/            order timeout sweep
  constants/permissions.ts   permission catalog + role templates
prisma/                      schema, SQL migrations, seed, Mongo import
tests/                       isolation tests + HTTP API tests
```

A request flows: **route → zod validator → controller → service (`withTenant`) → repository**.

## API

| Prefix | Who | Examples |
|---|---|---|
| `/api/auth` | everyone | `POST /login` (asks multi-org accounts to pick an organization), `/refresh-token`, `/forgot-password`, `/reset-password`, `/change-password` |
| `/api/client` | restaurant staff (signed in) | `/users`, `/roles`, `/categories`, `/menu`, `/tables` (+ `/:id/qr`), `/orders` (+ `/kitchen/queue`), `/payments` (+ `/reports/daily`), `/dashboard/*` |
| `/api/public` | guests (no login) | `GET /qr/:qrToken` (menu), `POST /orders`, `GET /qr/:qrToken/orders`, Khalti `/payments/khalti/initiate` + `/callback` |

Responses look like `{ success, message, data, ... }`, and errors like `{ success: false, error, code, message }`. Every object carries `id` plus an `_id` alias, so the existing frontend keeps working. Money goes over the API in rupees and is stored in paisa.

## Security model

- **Tenant isolation is enforced by Postgres.** Every tenant table has row-level security keyed on `app.org_id`, which `withTenant()` sets per transaction. Triggers stop rows from referencing another org's rows, which plain foreign keys can't do under RLS. `tests/tenant-isolation.test.ts` proves both.
- **Two database roles.** `waitzi_app` is subject to RLS and serves every request. `waitzi_platform` bypasses RLS and is used only for pre-tenant lookups (login, QR token resolution) and jobs, through `asPlatform(reason, …)`.
- **Permissions, not role names.** Routes call `requirePermission('payment.create')`. Each organization gets six editable role templates: admin, manager, cashier, waiter, kitchen_staff and stock_manager.
- **Guests** are identified only by the unguessable QR token on their table. They can't set discounts or see staff details.
- **Sockets** join org-scoped rooms only, and only for tables and orders that exist.

## Moving from the old MongoDB

`npm run db:import-mongo -- --mongo "<uri>" --org-slug <slug> --org-name "<name>" --dry-run`, then run it again without `--dry-run`. It writes in one transaction, can be re-run safely, keeps old passwords, and keeps printed QR codes working. The full cutover runbook is in `../PLATFORM_PLAN.md` §6b.
