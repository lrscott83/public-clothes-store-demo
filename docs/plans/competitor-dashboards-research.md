# Relevamiento de Dashboards de Competencia (Internet)

> A diferencia de `dashboard-references-analysis.md` (14 dashboards de ejemplo tomados
> de imágenes), este doc releva **productos reales de la competencia** y sus **páginas
> de ayuda / documentación** para ver qué dashboards muestran y qué ideas nos sirven
> para el cockpit de `salesops-mvp` (gestores/comisiones, almacén, decisiones,
> finanzas, multi-moneda USD/MN, varios métodos de pago).
>
> Fecha de relevamiento: 2026-07-11. Todas las fuentes están linkeadas al pie.

---

## Cómo leer esto

Cada ficha responde tres cosas:
1. **Qué es** el producto y a quién apunta.
2. **Qué muestra su dashboard** (KPIs + visuales), según su ayuda oficial.
3. **Qué idea concreta nos deja** para nuestras pantallas.

---

## 1. Shopify — Overview / Analytics

**Qué es:** plataforma de e-commerce/retail. Su dashboard de Analytics es la referencia
"de manual" de un panel de ventas moderno.

**Qué muestra (según Help Center):**
- Métricas de **ventas, sesiones y fulfillment**, actualizadas ~cada 1 minuto.
- **Tarjetas de métrica personalizables**: se agregan, quitan, reordenan, agrupan en
  secciones etiquetadas y se les cambia el tamaño.
- KPIs típicos: Total sales, AOV (ticket promedio), Sales by channel, Top-selling
  products, Conversion rate (con **embudo**: cart adds → checkout → compra).
- **Comparativa de períodos** y selector de rango de fechas sobre TODO el panel.
- **Metric targets**: cada tarjeta puede llevar un objetivo para medir cumplimiento.
- Reportes agrupados por categoría (Finances, Acquisition, Behavior), cada uno con
  gráfico + tabla filtrable.

**Idea para nosotros:**
- **Tarjetas configurables + objetivo por tarjeta.** Nuestro header de KPIs hoy es fijo;
  un "target" por KPI (ej. meta de ventas del mes) convierte el número en semáforo.
- **Comparativa de período como control global** (vs mes/período anterior), no por gráfico.

---

## 2. Square — Sales Summary + Payment Methods report

**Qué es:** POS + pagos. Muy relevante porque su fuerte es el **desglose por método de
pago** y el resumen de caja — justo lo que tu modelo maneja (USD/MN, contado/crédito).

**Qué muestra (según Support Center):**
- **Sales Summary:** Gross sales, Net sales (gross − returns − descuentos), Discounts &
  comps, Returns/Refunds, Taxes, Tips, Gift cards, Cash rounding, **Total Sales**, Fees
  (procesamiento), **Net Total** (total cobrado − fees).
- **Payment Methods report:** por cada método → nº de pagos y devoluciones, monto de
  pagos y devoluciones, fees, **total cobrado (pagos − devoluciones)**, tips, net total.
- **Sales Trends:** Gross sales, Net sales, **Average total sale**, Order count.
- **Help mode:** al pasar el mouse por una métrica, muestra su **definición**.

**Idea para nosotros:**
- **Reporte "por método de pago" como vista de primera clase.** Ya guardás método +
  snapshot del tipo de cambio; un breakdown pagos/devoluciones/neto por método (y por
  moneda) es directo y valioso para Finanzas.
- **"Help mode" (tooltip con la definición del KPI).** Barato de sumar, elimina la
  ambigüedad de "¿qué cuenta esto exactamente?" que ya te generó confusión antes.
- Distinción **Gross vs Net vs Total cobrado** — nombrar bien cada nivel evita el clásico
  "los totales no cierran".

---

## 3. Lightspeed Retail — BackOffice Dashboard + Analytics

**Qué es:** POS retail con back-office. Buen ejemplo de dashboard **operativo de caja**.

**Qué muestra (según Support):**
- **Tiles** de: totales de venta, analítica de transacciones y de clientes,
  **rentabilidad (profit)**, ventas guardadas, invoices.
- **Gráfico** de resumen de ventas + tiles de **top items**, **sales tenders** (medios
  de cobro), conteo de clientes y **resumen por caja/register**.
- Reportes en 3 categorías: **Sales & inventory / Marketing / Employee performance**.
- Reporting avanzado con **período de comparación** y **reportes agendados por email**
  (diario/semanal/mensual a stakeholders).

**Idea para nosotros:**
- **Categoría "Employee performance"** = tu pantalla de **gestores**. Lightspeed la trata
  como pilar propio, no como un gráfico suelto.
- **Resumen por "register"** ≈ resumen **por almacén/gestor**: mismo patrón de segmentar
  el total por unidad operativa.
- **Reportes agendados por email** como feature futura (resumen diario del cockpit).

---

## 4. Zoho Inventory — Dashboard

**Qué es:** gestión de inventario + ventas. El competidor **más parecido a tu combo
almacén + ventas**.

**Qué muestra (según User Guide):**
- **Top Selling Items** (5) con **% vs período anterior** (verde sube / rojo baja).
- **Top Stocked Items** (5 más reabastecidos).
- **Sales by Channel** (venta directa + marketplaces).
- **Sales Order Summary**: gráfico de órdenes con **toggle cantidad ↔ valor**.
- **Top Vendors** (5, por cantidad o valor).
- **Pending Actions**: agrupadas en **Sales / Purchases / Inventory** (ej. ítems por
  pickear, empaquetar, recibir).
- **Recent Activities** (últimas 100, con links al registro).

**Idea para nosotros (la ficha más aprovechable):**
- **"Pending Actions" agrupadas por área** = accionable puro. Tu cockpit es operativo:
  un bloque "qué falta hacer" (pedidos por despachar del almacén, cobros pendientes de
  gestores) le daría foco de acción, no solo lectura.
- **Toggle cantidad ↔ valor** en un mismo gráfico: dos lecturas sin duplicar la vista.
- **% vs período anterior con color** en cada top — comparativa liviana, sin gráfico extra.

---

## 5. HubSpot — Sales Analytics / Rep Performance

**Qué es:** CRM/Sales Hub. Referencia fuerte para **performance por vendedor** y
**comisiones** — el corazón de tu pantalla de gestores + finanzas.

**Qué muestra (según Knowledge Base):**
- **Dashboard por rep**: métricas específicas de cada vendedor.
- **Actividad:** llamadas, emails, reuniones agendadas.
- **Tasas de éxito:** deals ganados, conversion rate.
- **Deal performance:** valor de deals en progreso, monto ganado, **average deal size**
  por owner/equipo (con estado new / unchanged / reduced).
- **Comisiones:** propiedad calculada por deal + estado de comisión → dashboard que
  **trackea comisión por vendedor**.

**Idea para nosotros:**
- **Ranking de gestores con comisión trackeada** (devengada vs pagada vs pendiente).
  Ya calculás comisión por gestor en Finanzas; falta el **ranking comparativo** entre
  gestores en una sola vista.
- **"Average deal size" por gestor** = ticket promedio por gestor, muy barato de derivar.

---

## 6. Odoo — Sales Commission Dashboard

**Qué es:** ERP. Su módulo de comisiones muestra el patrón "dashboard de comisiones"
casi 1:1 con lo que necesitás.

**Qué muestra (según documentación / apps):**
- KPIs: **Total Sales Commission**, Total Invoice Commission, Total Payment Commission.
- Gráficos de comisión **semanal y mensual**.
- **Reporte por persona** entre fechas (PDF/Excel).
- Comisión configurable por **orden / factura / pago / producto / categoría / margen**.

**Idea para nosotros:**
- **Comisión sobre pago cobrado, no sobre venta emitida.** Odoo separa comisión por
  *invoice* vs por *payment*. En un modelo con cobros diferidos (crédito), comisionar
  sobre lo efectivamente cobrado cambia el número de Finanzas. Vale definirlo explícito.
- **Comisión por margen**, no solo por monto — se conecta directo con tu pantalla de
  **Decisiones** (rentabilidad por pedido).

---

## 7. Van Sales / DSD (BeatRoute, Pepperi, FieldPro, bMobile…)

**Qué es:** software de **venta en ruta / distribución en la calle** (Direct Store
Delivery). Es el rubro conceptualmente **más cercano a tu operación** (gestores en
territorio + almacén que despacha).

**Qué muestra (según sus sitios):**
- Dashboards **van-wise / route-wise / rep-wise**: performance, stock, cobertura y
  **cobranza (payment collection)** por vendedor/ruta.
- **Target vs actual por rep** (metas mensuales, por cuenta/marca).
- **Collections & Payments:** invoices pendientes y cobranza en tiempo real.
- Stock del vehículo que **se descuenta tras cada entrega**.
- KPIs de visitas por semana / cobertura.

**Idea para nosotros:**
- **Dashboard "por gestor" con cobranza pendiente** (outstanding). Si manejás crédito,
  la deuda por cobrar por gestor es un KPI operativo que hoy no está.
- **Target vs actual por gestor** como eje (no solo el ranking de lo vendido).
- **Stock que baja tras cada despacho** ≈ tu almacén: mostrar stock disponible vs
  comprometido por pedidos en curso.

---

## Síntesis: patrones que se repiten en productos reales

| Patrón | Quién lo hace | Nos aplica en |
|--------|---------------|---------------|
| Header de KPIs con **target por métrica** | Shopify | Todas |
| **Comparativa de período global** (vs anterior) | Shopify, Lightspeed | Todas |
| **Breakdown por método de pago** (pagos/devol./neto) | Square | Finanzas |
| **Tooltip con definición del KPI** ("help mode") | Square | Todas |
| **Performance por empleado/vendedor** como pilar | Lightspeed, HubSpot | Gestores |
| **Comisión: devengada / pagada / pendiente** | HubSpot, Odoo | Finanzas + Gestores |
| Comisión sobre **pago cobrado** y sobre **margen** | Odoo | Finanzas + Decisiones |
| **"Pending Actions" agrupadas por área** | Zoho | Cockpit (home/operación) |
| **Toggle cantidad ↔ valor** en un gráfico | Zoho | Inventario / Ventas |
| **Cobranza pendiente por vendedor/ruta** | Van Sales/DSD | Gestores |
| **Target vs actual por vendedor** | Van Sales, YTD | Gestores |

---

## Ideas priorizadas para el cockpit (mapeadas a pantallas existentes)

**Alto valor / bajo costo (derivable de datos que YA tenés):**
1. **Reporte por método de pago** (Square) → Finanzas. Ya guardás método + tipo de
   cambio snapshot: pagos / devoluciones / neto por método y por moneda.
2. **Tooltip de definición por KPI** (Square help mode) → transversal. Cierra la
   ambigüedad de "qué cuenta este número".
3. **Ranking de gestores + ticket promedio + comisión pendiente** (HubSpot/Odoo/DSD) →
   Gestores. Comparativa entre gestores en una sola vista.

**Alto valor / requiere una decisión de negocio:**
4. **Comisión sobre lo cobrado vs lo vendido** (Odoo) → definir la regla antes de
   graficarla. Impacta Finanzas.
5. **Target vs actual por gestor y por mes** (DSD/YTD) → necesita cargar metas.

**Estructural (cambia la forma del cockpit):**
6. **Bloque "Pending Actions" agrupado** (Zoho): pedidos por despachar (almacén) +
   cobros pendientes (gestores) en un solo lugar accionable.

---

## Fuentes

- Shopify — [Overview dashboard](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard) · [Shopify analytics](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports)
- Square — [Sales summary & reports](https://squareup.com/help/us/en/article/5381-in-app-summaries-and-reports) · [Set up analytics & reporting](https://squareup.com/help/us/en/article/5072-summaries-and-reports-from-the-online-dashboard) · [Help mode with reports](https://squareup.com/help/us/en/article/8466-use-help-mode-with-reports)
- Lightspeed — [About Lightspeed Analytics (R-Series)](https://retail-support.lightspeedhq.com/hc/en-us/articles/4410649517723-About-Lightspeed-Analytics) · [Analytics dashboard (S-Series)](https://shopkeep-support.lightspeedhq.com/support/reporting/analytics-dashboard) · [Sales summary report (X-Series)](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534089010715-Using-the-sales-summary-report)
- Zoho Inventory — [The Dashboard (User Guide)](https://www.zoho.com/us/inventory/help/getting-started/dashboard.html) · [Sales Reports](https://www.zoho.com/us/inventory/help/reports/sales-reports.html)
- HubSpot — [Sales Analytics](https://www.hubspot.com/products/sales/sales-reports) · [Create sales reports in the sales analytics suite](https://knowledge.hubspot.com/reports/create-sales-reports-in-the-sales-analytics-suite)
- Odoo — [Commissions (19.0 docs)](https://www.odoo.com/documentation/19.0/applications/sales/sales/commissions.html)
- Van Sales / DSD — [BeatRoute](https://beatroute.io/platform/van-sales-automation-software/) · [Pepperi DSD](https://www.pepperi.com/route-accounting-dsd/) · [FieldPro Van Sales](https://www.fieldproapp.com/features/van-sales) · [bMobile Route](https://bmobileroute.com/van-sales-software)
