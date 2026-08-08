# Estrategia de backend por módulos — salesops-mvp

> Estrategia conceptual para implementar el backend de salesops-mvp dividido en
> **módulos**, ordenados por dependencia, cada uno con sus **fases** de construcción.
> Define el **qué** y el **en qué orden** — no el stack ni las herramientas.
>
> **Método:** estudiamos varias referencias de la industria (ERPs y plataformas
> e-commerce modulares), buscamos el **consenso** entre todas y lo **adaptamos a
> nuestro problema**. NO copiamos ninguna: salesops es un dominio chico y específico
> (pedidos por gestores, 3 almacenes, comisiones en MN, tasas congeladas), no un ERP
> genérico. Nos quedamos con los principios; el modelo de dominio sigue siendo el
> nuestro (`SeedState` y su máquina de estados).
>
> Fuentes estudiadas: **Odoo 19**, **ERPNext**, **Dolibarr** (ERPs) · **Medusa**,
> **Sylius**, **Bagisto**, **Shopify** (e-commerce modular).

## Principio rector

Hoy salesops-mvp es una SPA 100% client-side: todos los datos son un único blob
`SeedState` generado por un PRNG semillado y guardado en `localStorage`. El sistema
ya está separado en tres responsabilidades limpias:

1. **Modelo de datos** — `SeedState` y sus entidades (`app/domain/types.ts`). Es el
   esquema de base de datos objetivo, tal cual.
2. **Lógica de negocio** — funciones puras `(state) => viewModel`
   (`app/domain/decisiones-dashboard.ts`, `app/domain/finanzas-dashboard.ts`,
   `app/domain/finanzas.ts`, `app/domain/period-trend.ts`). Sin I/O, ya testeadas.
3. **Persistencia** — `app/store/seed-store.ts`. Hoy es `localStorage`, y es el
   único punto que toca "el mundo exterior".

Ese punto único es el **seam** del backend: la estrategia consiste en ir
reemplazando, módulo por módulo, la porción del seed que cada uno cubre — sin
reescribir los dashboards.

## Consenso de la industria (qué dicen todas las fuentes)

Para cada pregunta de diseño se contrastó lo que hace cada plataforma. Donde
coinciden, hay consenso y lo adoptamos.

### 1. ¿Cuáles son los módulos fundación?

- **Medusa**: módulos "foundational" = Product, Inventory, Stock Location, Customer,
  Pricing, Currency, Sales Channel. Son los únicos sin dependencia hacia la capa
  transaccional. ([commerce-modules](https://docs.medusajs.com/resources/commerce-modules))
- **Shopify**: `Location` es entidad independiente; el inventario es
  location-scoped e independiente de las órdenes. ([InventoryLevel](https://shopify.dev/docs/api/admin-rest/latest/resources/inventorylevel))
- **Odoo 19**: `stock` depende de `product`; casi todo depende de `contacts`/`mail`.
- **Bagisto**: Product/Catalog + Inventory Sources (almacenes) como entidades base.
- **Sylius**: componentes standalone (Product, Customer) usables por separado.

> **Consenso:** Productos, Inventario, Clientes y Almacén/Ubicación son la **capa
> base**. Todo lo demás se apoya en ellos.

### 2. ¿Ventas depende de Inventario?

- **Odoo 19**: NO. `sale` → `['sales_team','account_payment','utm']` — no menciona
  `stock`. Son apps peer, unidas por el puente `sale_stock`. ([sale manifest](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/sale/__manifest__.py))
- **Dolibarr**: Stock es una rama opcional; `modCommande` (pedidos) depende solo de
  `modSociete` (terceros), no de stock. ([modCommande](https://raw.githubusercontent.com/Dolibarr/dolibarr/develop/htdocs/core/modules/modCommande.class.php))
- **Medusa**: Order referencia Product con link **read-only**; reserva inventario al
  momento de la orden, pero no lo "posee".

> **Consenso:** Ventas **referencia** productos/inventario pero NO es una dependencia
> dura. La integración (reservar/descontar stock) es un **seam/puente**, no código
> metido dentro de Ventas.

### 3. ¿Delivery depende de Ventas?

- **Odoo 19**: SÍ. `delivery` → `['sale','payment_custom']`, verbatim. ([delivery manifest](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/delivery/__manifest__.py))
- **Dolibarr**: `modExpedition` (envíos) → `modCommande` (pedidos). ([modExpedition](https://raw.githubusercontent.com/Dolibarr/dolibarr/develop/htdocs/core/modules/modExpedition.class.php))
- **Shopify**: `Order → FulfillmentOrder ← Location`. ([FulfillmentOrder](https://shopify.dev/docs/api/admin-rest/latest/resources/fulfillmentorder))
- **Medusa**: Fulfillment linkea a Order (stored) y a Stock Location (stored).

> **Consenso:** La **operación** de entrega depende de un pedido (Ventas) y necesita
> la Ubicación/Almacén. El **catálogo** de transportistas es data maestra
> independiente. En salesops, "entregado" ya es un estado del Pedido → la entrega ES
> una transición de la venta. (Corrige la intuición de "delivery no depende de
> ventas".)

### 4. ¿Comisiones/vendedores son core?

- **Odoo 19**: NO existe ningún módulo con "commission" en Community. Es Enterprise
  (un flag en `sale`) o el add-on de OCA. ([OCA/commission](https://github.com/OCA/commission))
- **Medusa**: comisiones vía add-on de marketplace (Mercur), nunca core.
- **Sylius**: Marketplace Suite / VendorPlugin, encima de Order/Product.
- **Bagisto**: paquete Multi-Vendor separado.

> **Consenso:** Comisiones son SIEMPRE un add-on sobre Ventas. → **Ventas no depende
> de Gestores.** (Confirma tu intuición original.)

### 5. ¿Dónde va Finanzas?

- **Odoo 19**: `account` es dependencia de manifiesto (carga temprano porque todos
  lo referencian) pero funcionalmente agrega datos de ventas/compras/stock.
- **Todas**: los reportes financieros son una capa de lectura sobre órdenes/pagos.

> **Consenso:** El **modelo de dinero** (monedas, tasas) es fundación; los
> **dashboards de Finanzas** son downstream (solo lectura). Por eso separamos: Tasas
> = base; Finanzas = downstream.

### 6. ¿Cómo se mantienen desacoplados los módulos?

- **Odoo 19**: apps independientes + módulos **puente** `auto_install` (`sale_stock`,
  `stock_account`, `stock_delivery`, `sale_crm`, `purchase_stock`, `pos_sale`) que se
  activan solo si ambas apps están.
- **Medusa**: cada módulo con **esquema de datos aislado**, sin FKs cruzadas; se
  conectan por "Module Links" (read-only o stored) en la capa de aplicación.
- **Sylius**: componentes standalone que se comunican por interfaces.
- **Bagisto**: paquetes `konekt/concord` acoplados por contratos/interfaces.

> **Consenso (el principio más importante):** módulos **independientes y testeables
> por separado**, con la integración explícita en un **link/puente** — nunca metida
> dentro de un módulo. Este es el patrón que adoptamos.

### 7. ¿En qué orden se instala/construye?

- **Odoo (retail)**: Inventario primero (define producto/almacén), luego Ventas,
  Compras, Contabilidad, CRM, Delivery, POS. ([Apps y módulos](https://www.odoo.com/documentation/19.0/applications/general/apps_modules.html))
- **Dolibarr**: Terceros → Productos → Pedidos → Facturas → (opcional) Stock/Envíos.
- **ERPNext**: Company/Accounts → Item/Warehouse → Customers → flujo transaccional.

> **Consenso:** **Datos maestros primero** (producto/almacén/cliente), después
> pedidos, después fulfillment/comisiones, y al final los reportes.

## Odoo 19 en detalle (la referencia más concreta)

Odoo es la fuente con el grafo de dependencias más explícito y verificable (cada app
declara `depends` en su `__manifest__.py`). Por eso se documenta aparte — como
**evidencia**, no como objetivo de implementación.

### Dependencias verbatim (rama 19.0)

| Módulo Odoo | `depends` (verbatim) | `auto_install` |
|---|---|---|
| `product` | `['base','mail','uom']` | — |
| `contacts` | `['base','mail']` | — |
| `account` (Invoicing) | `['base_setup','onboarding','product','analytic','portal','digest']` | — |
| `stock` (Inventory) | `['product','barcodes_gs1_nomenclature','digest']` | — |
| `sale` (Sales) | `['sales_team','account_payment','utm']` | — |
| `delivery` | `['sale','payment_custom']` | — |
| `crm` | `['base_setup','sales_team','mail','contacts','utm',…]` | — |
| `purchase` | `['account']` | — |

### Módulos puente (`auto_install`) — el patrón que adoptamos

| Puente | `depends` | Une |
|---|---|---|
| `stock_account` | `['stock','account']` | Inventario ↔ Contabilidad |
| `sale_stock` | `['sale','stock_account']` | Ventas ↔ Inventario |
| `stock_delivery` | `['sale_stock','delivery']` | Ventas+Stock ↔ Transportistas |
| `sale_crm` | `['sale','crm']` | CRM ↔ Ventas |

Fuentes (raw 19.0): [sale_stock](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/sale_stock/__manifest__.py) ·
[stock_account](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/stock_account/__manifest__.py) ·
[stock_delivery](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/stock_delivery/__manifest__.py)

## Cómo lo adaptamos a salesops (no lo replicamos)

Tomamos los principios del consenso y los bajamos a NUESTRO dominio. La tabla de
abajo es una **equivalencia de referencia** (para orientarse), no un objetivo de
implementar como Odoo:

| Módulo salesops | Se inspira en… | Qué NO copiamos |
|---|---|---|
| Productos | product (Odoo), Catalog (Bagisto/Medusa) | atributos/variantes/pricelists genéricos |
| Almacenes + Inventario | stock (Odoo), Stock Location (Medusa), Location (Shopify) | rutas push/pull, multi-step, lotes |
| Clientes | contacts (Odoo), Customer (Medusa) | portal, grupos, segmentación |
| Tasas de cambio | monedas de account (Odoo) | plan de cuentas, asientos contables |
| Usuarios / Roles | grupos de `base` (Odoo) | matriz de permisos genérica de ERP |
| Ventas / Pedidos | sale + puente sale_stock (Odoo) | presupuestos, políticas de facturación |
| Delivery | delivery + stock_delivery (Odoo), Fulfillment (Medusa) | integraciones de carriers reales (UPS/DHL) |
| Gestores + Comisiones | add-ons de comisión (OCA/Medusa/Sylius) | marketplace multi-vendor completo |
| Finanzas (dashboard) | reportes sobre account/sale (downstream) | contabilidad de doble entrada |
| Decisiones (dashboard) | KPIs/digest sobre sale/stock (downstream) | — |

## Mapa de módulos ordenado por dependencia

```
CAPA BASE (sin dependencias — data maestra)
  ├── Productos (catálogo, costo, comisión de referencia)
  ├── Almacenes + Inventario (stock por almacén)
  ├── Clientes
  ├── Tasas de cambio
  └── Usuarios / Roles / Acceso        (transversal)

CAPA TRANSACCIONAL (el corazón)
  └── Ventas / Pedidos
        ├─ referencia ─▶ Productos, Clientes, Tasas
        └─ [puente] ───▶ Inventario   (reserva/descuenta stock al vender)

CAPA SOBRE LA TRANSACCIÓN
  ├── Delivery              ──depende de──▶ Ventas  (+ catálogo Transportistas, base)
  └── Gestores + Comisiones ──depende de──▶ Ventas  (add-on, nunca core)

CAPA DOWNSTREAM (solo lectura — consumen, no poseen)
  ├── Finanzas    ──consume──▶ Ventas, Comisiones, Inventario, Tasas
  └── Decisiones  ──consume──▶ Ventas, Inventario, Delivery, Gestores

CAPA DE ORIGEN (captura real — reemplaza el WhatsApp)
  ├── App del Gestor      ──depende de──▶ Ventas, Gestores
  └── Ofertas del día     ──depende de──▶ Productos
```

Nota de diseño (consenso multi-fuente): el acoplamiento Ventas↔Inventario se modela
como un **puente/link** (reservar/descontar stock), no como dependencia dura dentro
de Ventas. Así los módulos quedan independientes y testeables por separado.

## Las fases dentro de cada módulo

Cada módulo se construye con la misma columna vertebral de 4 fases, adaptada según
si el módulo escribe datos o solo los lee:

- **Fase A — Modelo & contrato:** definir entidades, invariantes y esquema del
  módulo.
- **Fase B — Persistencia & lectura:** guardar y leer sus datos; cargar o migrar la
  data inicial.
- **Fase C — Operaciones:** las escrituras y reglas de negocio del módulo.
- **Fase D — Integración:** conectar con los otros módulos (vía puentes) y
  reemplazar esa porción del seed.

Aplicado módulo por módulo:

| Módulo | A · Modelo | B · Persistencia/Lectura | C · Operaciones | D · Integración |
|---|---|---|---|---|
| **Productos** | catálogo, costo, comisión ref. | leer catálogo real | alta/baja/edición | reemplaza `catalog.json` |
| **Almacenes+Inventario** | almacén como entidad; stock por almacén | leer inventario | ajustes de stock, reservas | sirve alertas de stock |
| **Clientes** | datos de cliente como entidad propia | leer/buscar | alta/edición | pedidos referencian cliente |
| **Tasas de cambio** | modelo de tasas + regla de congelamiento | leer tasas vigentes | editar tasas (sin recálculo retroactivo) | Ventas toma snapshot |
| **Usuarios/Roles** | roles por pantalla | sesión/identidad | login, permisos | acota datos por rol |
| **Ventas/Pedidos** | Pedido + máquina de estados + congelamiento | leer pedidos | crear, verificar (freeze rate/total/comisión) | puente: reserva inventario |
| **Delivery** | transportista (catálogo) + capacidad | leer entregas/capacidad | asignar transportista, marcar entregado, pickup | mueve estado del pedido |
| **Gestores+Comisiones** | gestor + devengo de comisión | leer comisiones por pagar | marcar comisión pagada | cierra ciclo del pedido |
| **Finanzas** | *(solo lectura)* view-models financieros | servir KPIs/series | — | lee Ventas+Comisiones+Inv+Tasas |
| **Decisiones** | *(solo lectura)* view-models operativos | servir widgets (7d/30d, filtros) | — | lee Ventas+Inv+Delivery+Gestores |
| **App Gestor** | — (reusa Ventas) | — | captura de pedido en origen | alimenta Ventas |
| **Ofertas del día** | oferta diaria | leer ofertas vigentes | publicar/despublicar | reemplaza el WhatsApp |

## Orden de construcción según la necesidad del dueño

Alineado con el consenso (datos maestros primero). El dueño quiere **ver el dinero y
decidir**, pero Finanzas y Decisiones son downstream: no pueden ser el punto de
partida porque no tendrían de dónde leer.

1. **Base mínima:** Productos + Almacenes/Inventario + Clientes + Tasas.
2. **Ventas/Pedidos** (con el puente a Inventario) — apenas existe, hay data real
   fluyendo.
3. **Delivery + Gestores/Comisiones** — completan el ciclo de vida del pedido.
4. **Finanzas + Decisiones** — se encienden solos, porque ya tienen data real que
   leer.
5. **App del Gestor + Ofertas del día** — la captura en origen que reemplaza el
   WhatsApp.

Los dashboards — el anzuelo comercial — son de los últimos, y está bien: son el
premio que aparece cuando la base ya está construida.

---

### Fuentes

**ERPs**
- Odoo 19 (rama `19.0`), manifiestos verbatim: [odoo/odoo](https://github.com/odoo/odoo) ·
  [Release Notes](https://www.odoo.com/odoo-19-release-notes) ·
  [Módulos y apps](https://www.odoo.com/documentation/19.0/applications/general/apps_modules.html) ·
  [Manifests reference](https://www.odoo.com/documentation/19.0/developer/reference/backend/module.html)
- Dolibarr: [modExpedition](https://raw.githubusercontent.com/Dolibarr/dolibarr/develop/htdocs/core/modules/modExpedition.class.php) ·
  [modCommande](https://raw.githubusercontent.com/Dolibarr/dolibarr/develop/htdocs/core/modules/modCommande.class.php)
- ERPNext: [modules.txt](https://github.com/frappe/erpnext/blob/develop/erpnext/modules.txt) ·
  [Quotation flow](https://docs.frappe.io/erpnext/user/manual/en/quotation)

**E-commerce modular**
- Medusa: [Commerce Modules](https://docs.medusajs.com/resources/commerce-modules) ·
  [Stock Location links](https://docs.medusajs.com/resources/commerce-modules/stock-location/links-to-other-modules) ·
  [OMS recipe](https://docs.medusajs.com/resources/recipes/oms)
- Shopify: [InventoryLevel/Location](https://shopify.dev/docs/api/admin-rest/latest/resources/inventorylevel) ·
  [FulfillmentOrder](https://shopify.dev/docs/api/admin-rest/latest/resources/fulfillmentorder)
- Sylius: [Architecture](https://old-docs.sylius.com/en/1.6/book/architecture/architecture.html)
- Bagisto: [Multi-warehouse inventory](https://bagisto.com/en/multi-warehouse-inventory-management-in-bagisto/)

**Comisiones (add-on, no core)**
- Odoo Enterprise: [Commissions](https://www.odoo.com/documentation/19.0/applications/sales/sales/commissions.html) ·
  OCA: [github.com/OCA/commission](https://github.com/OCA/commission)
