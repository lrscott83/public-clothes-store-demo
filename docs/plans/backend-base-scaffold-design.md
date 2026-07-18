# Diseño — Base de arquitectura backend (esqueleto lean poolops)

> Spec del **primer entregable de backend** de store-mgmt: el **esqueleto** de la
> arquitectura hexagonal, corriendo de punta a punta con un `/health` que hace ping
> real a la base de datos. SIN módulos de dominio todavía (Currency es el paso
> siguiente, como SDD aparte).
>
> Arquitectura objetivo: [../system/architecture.md](../system/architecture.md) ·
> Patrón de referencia (hermano): `poolops-biz`, adoptado en versión **lean**
> (sin multi-tenant, sin IdP/auth, sin worker).

## 1. Objetivo y alcance

Crear la **base** de la arquitectura backend "como debe ser", coexistiendo en el
monorepo `templates/` junto a `salesops-mvp`, que queda **congelado como espejo del
MVP** (no se toca una sola línea).

**Entra en este entregable:**
- App NestJS desplegable (`api-salesops`) que bootea.
- Package de infraestructura (`infra-db`) con Prisma + Postgres conectando.
- Endpoint `GET /health` que verifica la conexión a la DB (walking skeleton de infra).
- Límites de arquitectura forzados por ESLint (`backend-boundaries`).
- `docker-compose` con Postgres para desarrollo local.

**NO entra (YAGNI — se agrega cuando el negocio lo pida):**
- Módulos de dominio (Currency y siguientes → SDD posterior).
- `api-common` (no hay plumbing Nest compartido aún: sin auth, un solo app).
- Multi-tenancy, IdP/auth, JWT, worker de jobs.
- Cualquier cambio a `@store-mgmt/domain`, `salesops-mvp`, `static-store`.

## 2. Stack (committeado)

| Pieza | Elección | Nota |
|---|---|---|
| Framework backend | **NestJS 11** | Igual que poolops |
| ORM | **Prisma 7** + `@prisma/adapter-pg` | Driver adapter, igual que poolops |
| Base de datos | **Postgres 16** (`postgres:16-alpine`) | docker-compose, espejo de poolops |
| Monorepo | **pnpm + turbo** | Ya existentes; `apps/*` y `packages/*` ya en el workspace |
| Config | `@nestjs/config` | Env vars: `DATABASE_URL`, `PORT` |

## 3. Estructura de archivos (nueva, toda bajo `templates/`)

```
templates/
  docker-compose.yml              ← NUEVO: servicio postgres:16-alpine
  apps/
    api-salesops/                 ← NUEVO app NestJS
      package.json                @store-mgmt/api-salesops
      tsconfig.json               extiende @store-mgmt/typescript-config
      nest-cli.json
      .env.example                DATABASE_URL, PORT
      src/
        main.ts                   bootstrap (PORT ?? 3001)
        app.module.ts             ConfigModule + InfraDbModule + HealthModule
        health/
          health.controller.ts    GET /health
          health.module.ts
      test/
        health.e2e-spec.ts        test de integración del endpoint
  packages/
    infra-db/                     ← NUEVO package
      package.json                @store-mgmt/infra-db
      tsconfig.json
      prisma/
        schema.prisma             datasource postgres + generator (SIN models)
      src/
        index.ts                  superficie pública
        prisma-client.ts          PrismaService (injectable)
        infra-db.module.ts        InfraDbModule (provee/exporta PrismaService)
    eslint-config/                ← MODIFICADO: + backend-boundaries
      backend-boundaries.config.js
    typescript-config/            ← MODIFICADO si falta: base node/backend
```

## 4. Componentes (contrato de cada unidad)

### 4.1 `PrismaService` (`infra-db/src/prisma-client.ts`)
- **Qué hace:** envuelve `PrismaClient` con `@prisma/adapter-pg`. Injectable de Nest.
  Conecta en `onModuleInit`, desconecta en `onModuleDestroy`.
- **Cómo se usa:** se inyecta donde haga falta acceso a la DB (hoy solo el health check).
- **Depende de:** `DATABASE_URL` (env), `@prisma/client`, `@prisma/adapter-pg`.
- **Expone:** el cliente Prisma + un método/consulta de ping (`$queryRaw SELECT 1`).

### 4.2 `InfraDbModule` (`infra-db/src/infra-db.module.ts`)
- **Qué hace:** módulo Nest que provee y **exporta** `PrismaService` para que otros
  módulos lo inyecten.
- **Depende de:** `PrismaService`.

### 4.3 `HealthController` (`api-salesops/src/health/health.controller.ts`)
- **Qué hace:** `GET /health`. Inyecta `PrismaService`, ejecuta `SELECT 1`.
  - DB responde → `200 { status: 'ok', db: 'up' }`
  - DB falla → `503 { status: 'error', db: 'down' }`
- **Por qué sin `@nestjs/terminus`:** una consulta directa es suficiente para el
  esqueleto; terminus es una dependencia extra sin valor hoy (YAGNI).

### 4.4 `AppModule` (`api-salesops/src/app.module.ts`)
- Importa `ConfigModule.forRoot({ isGlobal: true })`, `InfraDbModule`, `HealthModule`.

### 4.5 `main.ts`
- `NestFactory.create(AppModule)`, `app.listen(process.env.PORT ?? 3001)`.
- Puerto **3001** para no chocar con apps que usen 3000.

### 4.6 `schema.prisma`
- `generator client { provider = "prisma-client-js" }`
- `datasource db { provider = "postgresql"; url = env("DATABASE_URL") }`
- **Sin models.** Una primera migración vacía (o baseline) establece la DB.

### 4.7 `backend-boundaries.config.js` (eslint-config)
- Regla `no-restricted-imports` (o equivalente por zonas):
  - `@store-mgmt/domain` **no** importa de `@store-mgmt/infra-*` ni de `apps/*`.
  - Apps web (`salesops-mvp`, `static-store`) **no** importan `@store-mgmt/infra-db`
    ni `@store-mgmt/api-salesops`.
- Se consume desde la config ESLint de los packages/apps que corresponda.

## 5. Flujo de datos (health check)

```
GET /health
  → HealthController
    → PrismaService.$queryRaw`SELECT 1`
      → adapter-pg → Postgres
    ← ok  → 200 { status:'ok', db:'up' }
    ← err → 503 { status:'error', db:'down' }
```

## 6. Manejo de errores

- Fallo de conexión a la DB en el health check → capturado, responde `503` con
  `db:'down'` (nunca tira 500 sin contexto).
- Fallo de conexión al **bootear** (`onModuleInit`): Nest falla el arranque con log
  claro. Es el comportamiento deseado — si no hay DB, el app no levanta.

## 7. Testing (Strict TDD activo)

| Unidad | Test | Tipo |
|---|---|---|
| `/health` con DB arriba | responde `200 { db:'up' }` | e2e/integración (`health.e2e-spec.ts`) |
| `/health` con DB caída | responde `503 { db:'down' }` | integración (mock de `PrismaService` que rechaza) |

- Los archivos de configuración pura (docker-compose, tsconfig, nest-cli, schema
  vacío) **no son TDD-ables** — se verifican corriendo el sistema (§8), no con tests.
- La unidad testeable real es el **health check**: se escribe el test primero
  (RED: sin controller), luego la implementación (GREEN).

## 8. Verificación (evidencia de que anda)

1. `docker compose up -d postgres` → Postgres 16 arriba, healthcheck OK.
2. `pnpm --filter @store-mgmt/infra-db prisma:generate` → cliente generado.
3. `pnpm --filter @store-mgmt/infra-db prisma:migrate` → migración aplicada.
4. `pnpm --filter @store-mgmt/api-salesops dev` → Nest bootea, log de puerto.
5. `curl localhost:3001/health` → `{ "status":"ok", "db":"up" }`.
6. `pnpm --filter @store-mgmt/api-salesops test` → e2e del health en verde.
7. `pnpm lint` → sin violaciones de `backend-boundaries`.

## 9. Pendiente downstream (fuera de este entregable)

- Actualizar [../system/architecture.md](../system/architecture.md): hoy dice
  "`infra-*`/`api-*` cuando haga falta". Reemplazar por el stack ya committeado
  (NestJS 11 / Prisma 7 / Postgres 16) y marcar `api-salesops` + `infra-db` como
  **existentes**. Se hace al cerrar esta base.
- Primer módulo de dominio: **Monedas y Tasas de Cambio** (Currency) — vertical slice
  domain→infra-db→api, como cambio SDD aparte. Diseño ya validado en
  [monedas-tasas-cambio-design.md](./monedas-tasas-cambio-design.md).

## 10. Decisiones registradas

| Decisión | Resolución | Razón |
|---|---|---|
| Alcance de la base | Esqueleto vacío + health check | Currency queda como SDD posterior |
| Fidelidad a poolops | Lean (sin tenant/auth/worker) | salesops hace 3-6 pedidos/día; YAGNI |
| `api-common` | No se crea aún | Sin plumbing Nest compartido hoy |
| `@store-mgmt/domain` | Intacto en esta base | No hay módulo todavía |
| Motor de DB | Postgres 16 | Espejo de poolops, default de Prisma |
| Health check | Consulta directa, sin terminus | Suficiente para el esqueleto |
| Puerto del app | 3001 | Evitar choque con 3000 |
