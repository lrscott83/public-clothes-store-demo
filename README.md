# public-clothes-store-demo

Monorepo de demos de e-commerce/sales-ops. Dos mundos conviven aquí:

## `templates/` — el producto (pnpm + turbo)

Arquitectura hexagonal shared-kernel. **Lógica de negocio pura en
`packages/`; delivery y wiring en `apps/`; la infraestructura entra por
puertos que define el dominio.** Antes de agregar componentes leé
[docs/system/architecture.md](docs/system/architecture.md).

| App | Qué es |
|---|---|
| `apps/web-catalog` | Storefront SSR multi-tenant + `/admin` por tienda + consola superadmin en `admin.<host>` |
| `apps/api-public` | API pública anónima por tenant (host-slug → schema) |
| `apps/api-salesops` | API autenticada del cockpit (ventas, inventario, delivery, comisiones, productos) |
| `apps/api-idp` | Identidad: usuarios, login/JWT, compañías + saga de aprovisionamiento de tenants |
| `apps/salesops-mvp` | Cockpit legado (React SPA) |
| `apps/static-store` | Storefront estático legacy (congelado) |

Paquetes: `domain` (puertos + modelos puros), `infra-db` (Prisma,
multi-tenant por schema Postgres), `infra-storage` (imágenes en disco vía
sharp), `api-common` / `web-common` / `storefront`.

### Correr todo localmente

Postgres 17 en `localhost:5433` (bases `store_mgmt` + `store_mgmt_test`),
`.env` gitignored por app (ver `env.example` de cada una), luego:

```bash
cd templates
pnpm install
pnpm --filter @store-mgmt/infra-db exec prisma db seed   # tenant 'default' demo
# 4 terminales:
pnpm --filter @store-mgmt/api-idp dev        # :4902
pnpm --filter @store-mgmt/api-salesops dev   # :4901
pnpm --filter @store-mgmt/api-public dev     # :4903
pnpm --filter @store-mgmt/web-catalog exec react-router dev --port 3900
```

- Tienda demo: http://default.localhost:3900/
- Admin tienda: http://default.localhost:3900/admin (`admin` / `DevPass123!`)
- Consola plataforma: http://admin.localhost:3900/tiendas

### Specs y planificación

OpenSpec: specs vivas en `openspec/specs/`, cambios en
`openspec/changes/`, historial en `openspec/changes/archive/`.
Herramientas: `openspec/tools/audit-spec-merges.py`.

## `pizzeria-piloto/` — landing estática independiente

Sin build ni dependencias; ver su [README](pizzeria-piloto/README.md).
