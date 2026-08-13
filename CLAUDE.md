# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository structure

This repo is a monorepo of three independently deployable projects, each with its own `package.json`, `.gitignore`, and (currently) its own nested `.git` directory:

- `api/` — NestJS backend (TypeScript, TypeORM/Postgres, JWT auth, WebSockets)
- `client-app/` — Angular 21 PWA for end users (booking sports fields, browsing a shop)
- `dashboard/` — Angular 21 app for field owners, vendors, and super-admins

There is no root-level package manager workspace — each project is installed, built, and tested independently from its own directory.

## Commands

### api (NestJS)
Run from `api/`:
- `npm run start:dev` — dev server with watch mode
- `npm run build` — compile (`nest build`)
- `npm run lint` — eslint with `--fix`
- `npm run format` — prettier write on `src/**/*.ts` and `test/**/*.ts`
- `npm run test` — jest unit tests; `npm run test:watch`, `npm run test:cov`
- `npm run test:e2e` — e2e tests (config: `test/jest-e2e.json`)
- Single test file: `npx jest path/to/file.spec.ts`
- Single test by name: `npx jest -t "test name"`

### client-app / dashboard (Angular 21)
Run from `client-app/` or `dashboard/`:
- `npm start` (or `ng serve`) — dev server, default `http://localhost:4200`
- `npm run build` — production build to `dist/`
- `npm test` (or `ng test`) — unit tests via **Vitest** (not Karma/Jasmine)
- No e2e framework is configured in either app

## Architecture

### api

- Entry point `src/main.ts`: global prefix `api/v1`, `ValidationPipe` (whitelist + transform), Helmet, CORS open (`origin: '*'`), Socket.IO adapter, global exception filter + response/logging interceptors.
- `src/app.module.ts` wires everything: `ConfigModule` (validated via Joi schema in `src/config/configuration.ts`), `TypeOrmModule` with `synchronize: true` and `migrationsRun: false` (migrations live in `src/database/migrations` and `src/migrations` — check both), `ThrottlerModule` (60 req/60s default).
- **Two global guards are applied via `APP_GUARD`**: `JwtAuthGuard` then `RolesGuard` — every endpoint requires a valid JWT and passes role checks by default. Use the `@Public()` decorator (`common/decorators/public.decorator.ts`) to bypass auth, and `@Roles(...)` (`common/decorators/roles.decorator.ts`) to restrict by `Role` enum (`common/enums`: `client`, `owner`, `vendor`, `admin`, `field_admin`, `controller`).
- Feature modules live under `src/modules/*` (auth, users, fields, bookings, payments, transactions, withdrawals, articles, notifications, storage, admin, enrollment), each following controller/service/module + `dto/`/`entities/` subfolders.
- **Provider factory pattern** is used for swappable external integrations, selected via env var at runtime:
  - `modules/payments/factories/payment-provider.factory.ts` picks between `providers/mock.provider.ts` and `providers/samirpay.provider.ts` based on `PAYMENT_PROVIDER_NAME`.
  - `modules/notifications/factories/sms-provider.factory.ts` picks between `providers/mock.provider.ts` and `providers/mtarget.provider.ts` based on `SMS_PROVIDER_NAME` (see `MTARGET_INTEGRATION.md` at repo root for the MTarget SMS API contract).
  - When adding a new payment/SMS provider, implement the shared interface in that module's `interfaces/` folder and register it in the factory — don't call the provider directly from services.
- Auth uses Passport JWT strategies (`modules/auth/strategies`: access + refresh) plus OTP (`src/otp/`) for phone verification.
- File uploads/storage go through `modules/storage` backed by Supabase Storage (`@supabase/supabase-js`).

### client-app & dashboard (Angular)

Both apps share the same structural convention under `src/app/`:
- `core/` — singleton services, guards, interceptors, models (app-wide, loaded once)
- `features/` — route-level feature folders (one per screen/flow)
- `layout/` — shell/layout components (e.g. `main-layout`, `dashboard-layout`)
- `shared/` — reusable presentational components and pipes

`dashboard` further splits `features/` by role: `field-owner/`, `vendor/`, `super-admin/`, mirroring the `Role` enum from the API. `client-app` is customer-facing and includes a PWA install prompt and `@angular/service-worker`.

Both apps consume the same NestJS API (`api/v1` prefix, JWT bearer auth) — check `src/environments/` for the configured API base URL per environment.

## Conventions

- Prettier: single quotes, trailing commas everywhere (`.prettierrc` in each project).
- `api` ESLint config disables `no-explicit-any` and downgrades `no-floating-promises`/`no-unsafe-argument` to warnings — don't treat those as hard errors when reviewing.
- Never commit `.env` files; only `.env.example` is tracked. `api/.env.example` documents all required variables (DB, JWT secrets, OTP, payment/SMS provider keys, Supabase).
