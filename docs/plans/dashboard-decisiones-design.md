# Diseño — Dashboard de Decisiones (gancho para la propuesta)

- **Fecha:** 2026-07-11
- **Pantalla:** `/decisiones` (Pantalla 6 del cockpit `salesops-mvp`)
- **Estado:** Diseño propuesto — pendiente de construir la maqueta
- **Propósito:** Convertir la actual `/decisiones` (hoy solo un ranking de
  rentabilidad en tabla) en un dashboard visual que sirva de **gancho** para la
  propuesta comercial, y que además sea útil para operar.

## Contexto

Fuentes analizadas:
- [dashboard-references-analysis.md](dashboard-references-analysis.md) — 14 dashboards de ejemplo.
- [competitor-dashboards-research.md](competitor-dashboards-research.md) — competencia real (Shopify, Square, Zoho, HubSpot, Odoo, Van Sales/DSD).

Estado actual de la pantalla: solo un ranking de rentabilidad por pedido
(tabla + tarjeta de totales, vía `buildProfitabilityRanking`). Le faltan los 6
visuales que el plan original prometía.

Enfoque elegido: **mixto en capas** — primero la foto que enamora, después los
bloques accionables.

## El diseño: una sola pantalla, 3 capas

### Capa 1 — Cabecera de KPIs (el gancho, se lee en 5 segundos)
5 tarjetas con **comparativa** de período (últimos 10 días vs los 10 anteriores,
patrón Shopify/Lightspeed) + flecha de tendencia:

| KPI | Por qué le pega al dueño | Dato que lo alimenta |
|-----|--------------------------|----------------------|
| Ventas (USD) | El número que hoy calcula a ojo | Σ `totalUSD` |
| Margen (USD) + % | El número que **nunca vio** | `totalUSD − costo − comisión` |
| Pedidos + ticket promedio | Volumen y calidad de venta | count + AOV |
| Comisión pendiente (MN) | Dinero que le debe a gestores | Σ `commissionMN` no pagada |
| Cobrado vs pendiente | Salud de caja | estados entregado vs en tránsito |

### Capa 2 — La foto del negocio (4 visuales)
- **Tendencia de ventas 20 días** (área) con toggle **cantidad ↔ valor** (Zoho).
- **Pedidos por etapa** (creado → verificado → transportando → entregado →
  comisión pagada): dónde están parados los pedidos. *(Foto de distribución, no
  conversión por cohorte.)*
- **Ventas por almacén** (barras): qué almacén tira del negocio.
- **Mix por moneda / método de pago** (dona). Ahora el seed genera 4 métodos
  (USD/MN/ZELLE/EUR → 4 tajadas), así que la dona por moneda quedó viable.
  Alternativa igual de válida: mix por categoría de producto.

### Capa 3 — Para decidir (3 bloques accionables)
- **Ranking de gestores**: ventas + ticket promedio + comisión devengada/
  pendiente, con % vs período en color (HubSpot/Odoo/DSD).
- **Top productos por MARGEN** (no por venta): decisiones de compra.
- **Alertas de inventario** (bajo/agotado por almacén, patrón "Pending Actions"
  de Zoho) + **pedidos de menor margen** (ranking ascendente; reusa
  `buildProfitabilityRanking`).

## Qué se alimenta con datos reales HOY ✅

~60-100 pedidos en 20 días, 5 gestores, 3 almacenes, timestamps por estado,
`costUSD` (= 60% del precio), comisión congelada, tasa snapshot, inventario por
almacén. Todos los bloques de arriba son alimentables sin inventar datos.

## Matices honestos ⚠️ (ya resueltos en el diseño)

1. **"Pedidos que pierden dinero" quedaría vacío**: costo fijo en 60% → todo
   pedido tiene 40% de margen bruto y la comisión es chica; ninguno da negativo.
   → Se reemplaza por **"pedidos de menor margen"** (ranking ascendente).
2. **El embudo es una distribución, no una conversión real** → se etiqueta
   "Pedidos por etapa", no "% de conversión".

## Decisiones tomadas sobre datos a guardar

1. **Meta de ventas** — ❌ DESCARTADA. No la vamos a tener; el diseño no incluye
   gauge de cumplimiento ni semáforo vs objetivo.
2. **Costo de transporte por entrega** — presente como idea, pero **fuera de
   alcance de este dashboard**: es de Finanzas, no de Decisiones.
3. **Diversidad de monedas (ZELLE/EUR)** — ✅ HECHO. Se agregaron ZELLE (12) y
   EUR (8) a `PAYMENT_METHOD_WEIGHTS` y se subió `VERSION` a 4. El seed ahora
   genera los 4 métodos (verificado: 93 pedidos → USD 43 / MN 34 / ZELLE 12 /
   EUR 4). 336 tests en verde.

## Próximo paso

Construir la maqueta con todo el set verde (100% datos reales, matices ya
resueltos, sin meta de ventas).
