# Diseño — Dashboard de Decisiones (rediseño operativo)

- **Fecha:** 2026-07-14 (actualizado 2026-07-15)
- **Pantalla:** `/decisiones` (Pantalla 6 del cockpit `salesops-mvp`)
- **Estado:** Diseño final aprobado — pendiente de bajar a plan de implementación
- **Propósito:** Reconvertir `/decisiones` en un **tablero operativo** para la toma
  de decisiones del día a día. El dueño lo abre a la mañana y sabe qué está
  pasando HOY, cómo viene comparado con hace 7 días, y qué necesita atención ya.
- **Reemplaza a:** [dashboard-decisiones-design.md](dashboard-decisiones-design.md)
  (diseño anterior, de ángulo mixto ventas/margen).

## Separación de responsabilidades: Decisiones vs Finanzas

La regla de fondo sigue siendo: **lo operativo manda en Decisiones, el dinero
vive en Finanzas.** En esta primera iteración, sin embargo, Decisiones arranca
como **un dashboard completo** que conserva los bloques de análisis del diseño
actual (gestores, margen, moneda, ventas por almacén) en una sección claramente
separada al final. Es un punto de partida: la separación total con Finanzas se
completa en una iteración posterior.

## El diseño: una sola pantalla, 3 capas + análisis

### Capa 1 — Pulso inmediato (3 cards · en mobile 1 por fila)

Qué está pasando AHORA. Tres cards grandes; en mobile se apila una por fila.

- **1.1 Pedidos activos por estado y almacén** — gráfico de barras. Eje X: los
  **3 estados no completados** (Nuevos = `creado`, Verificados = `verificado`,
  Transportando = `transportando`). Cantidades por almacén, con color fijo:
  **Pinar = verde, Consolación = azul, Herradura = amarillo**. `entregado` no
  va aquí (ya está completado).
- **1.2 Transportistas** — capacidad operativa: **disponibles vs. transportando**
  (barra de capacidad). Se deriva del modelo: *ocupado* = tiene un pedido en
  estado `transportando`; *disponible* = no. Incluye **"Sin chofer"**: pedidos
  `verificado` listos para salir pero sin transportista asignado — el cuello de
  botella real (mercadería lista parada). Opcional: mini-lista de pedidos por
  transportista para balancear carga.
- **1.3 Comisiones por pagar** — total general + lista de las **más atrasadas**,
  una fila por gestor (sin repetir). Cada fila: **días de atraso**, **valor de
  esa comisión** y **total pendiente del gestor**. Regla de atraso: la comisión
  se cuenta atrasada por los días transcurridos **desde que el pedido pasó a
  `entregado` y aún no se pagó** (la comisión se paga al entregar).

### Capa 2 — ¿Qué atiendo YA? (lo accionable)

- **Stock crítico por almacén** (agotado / bajo). Reusa `buildInventoryAlerts`.
- **Pedidos demorados / trabados** — pedidos estancados demasiado tiempo en una
  etapa sin avanzar, con antigüedad y semáforo. Lo habilita el **timestamp por
  estado** que el seed ya guarda.

### Capa 3 — Comportamiento en el tiempo · filtro `[ 7d / 30d ]`

Todo el bloque se filtra por **últimos 7 días** o **últimos 30 días**, contando
siempre el día actual.

- **Entra vs. sale (período)** — creados vs. entregados en el período. Avisa si
  se acumula backlog (entra más de lo que sale).
- **Ciclo promedio** — días de `creado` → `entregado`, con Δ vs. período previo.
- **3.1 Pedidos por día** — con toggle **Nº pedidos ⇄ valor de venta**. KPIs:
  promedio/día y Δ% vs. período previo.
- **3.2 Pedidos completados por día** — mismo formato que 3.1. KPI adicional:
  **tasa de completado** (entregados / total del período).

### Sección Análisis (se mantiene del dashboard actual, con filtros)

- **Ventas por almacén** — filtro `[ 7d / 30d ]`.
- **Mix por moneda** — filtro `[ 7d / 30d ]`.
- **Ranking de gestores** — filtro `[ 7d / 30d / General ]`.
- **Top productos por margen** — filtro `[ 7d / 30d / General ]`.
- **Pedidos de menor margen** — filtro `[ 7d / 30d / General ]`.

## Maqueta (ASCII)

```
╔═ DECISIONES · Operación ═══════════════════════════════════════════════════════╗
║                                                                                ║
║  CAPA 1 — Pulso inmediato (3 cards · en mobile 1 por fila)                     ║
║  ┌────────────────────────────────┐ ┌──────────────┐ ┌──────────────────────┐ ║
║  │ 1.1 Pedidos activos por estado │ │ 1.2          │ │ 1.3 Comisiones por   │ ║
║  │     y almacén                  │ │ Transportistas│ │     pagar            │ ║
║  │  ■Pinar ■Consol. ■Herradura   │ │              │ │  Total: 215.000 MN   │ ║
║  │  12┤                          │ │  Disponibles │ │                      │ ║
║  │    │ █                        │ │      3       │ │  Más atrasadas:      │ ║
║  │   8┤ █    █                   │ │  ┌────────┐  │ │  (días sin pagar     │ ║
║  │    │ █    █                   │ │  │███░░░░░│  │ │   tras entregar)     │ ║
║  │   4┤ █    █    █              │ │  └────────┘  │ │                      │ ║
║  │    │ █    █    █              │ │  Transportando│ │ Liset F.  hace 9d    │ ║
║  │    └───────────────────       │ │      4       │ │   esta 12.000·tot 35k│ ║
║  │    Nuevos Verif Transp        │ │              │ │ Maikel S. hace 7d    │ ║
║  │    (3 estados no completados) │ │ Sin chofer:2 │ │   esta 15.000·tot 35k│ ║
║  │                               │ │              │ │ Dayana H. hace 5d    │ ║
║  │                               │ │              │ │   esta 10.000·tot 30k│ ║
║  └────────────────────────────────┘ └──────────────┘ └──────────────────────┘ ║
║                                                                                ║
║  CAPA 2 — ¿Qué atiendo YA? (lo accionable)                                     ║
║  ┌───────────────────────────────────┐ ┌─────────────────────────────────────┐ ║
║  │ ⚠ Stock crítico por almacén       │ │ ⏱ Pedidos demorados / trabados      │ ║
║  │ Pinar  · Smart TV 43"   0 Agotado │ │ #1043 Verificado hace 4 días  🔴    │ ║
║  │ Pinar  · Exhibidor 20P  1 Bajo    │ │ #1027 Transportando hace 3 d  🟠    │ ║
║  │ Consol.· Freidora Aire  1 Bajo    │ │ #1051 Creado sin verificar 2d       │ ║
║  │ +15 más                           │ │ (estancados en una etapa)           │ ║
║  └───────────────────────────────────┘ └─────────────────────────────────────┘ ║
║                                                                                ║
║  CAPA 3 — Comportamiento en el tiempo         [ Últimos 7 días ▾ ] (7d / 30d) ║
║  ┌───────────────────────────────┐  ┌──────────────────────────────────────┐  ║
║  │ Entra vs. sale (período)      │  │ Ciclo promedio                       │  ║
║  │   Creados 63 → Entregados 52  │  │   Creado → entregado                 │  ║
║  │   ▲ acumulás backlog (+11)    │  │      4.3 días   ▲ +0.5 vs previo     │  ║
║  └───────────────────────────────┘  └──────────────────────────────────────┘  ║
║  ┌───────────────────────────────────┐ ┌─────────────────────────────────────┐ ║
║  │ 3.1 Pedidos por día               │ │ 3.2 Pedidos completados por día     │ ║
║  │     [ Nº pedidos ⇄ Valor venta ]  │ │     [ Nº pedidos ⇄ Valor venta ]    │ ║
║  │              ▁▂▅▃▆█▄               │ │                ▁▃▄▂▅▆█             │ ║
║  │  Prom/día: 9    ▲ +12% vs previo  │ │  Prom/día: 7   Tasa compl. 78%     │ ║
║  └───────────────────────────────────┘ └─────────────────────────────────────┘ ║
║                                                                                ║
║  ── Análisis (se mantiene del actual) ──────────────────────────────────────  ║
║  ┌─────────────────────┐ ┌─────────────────────┐                              ║
║  │ Ventas por almacén  │ │ Mix por moneda      │   [ 7d / 30d ]               ║
║  └─────────────────────┘ └─────────────────────┘                              ║
║  ┌─────────────────────┐ ┌─────────────────────┐                              ║
║  │ Ranking de gestores │ │ Top productos margen│   [ 7d / 30d / General ]     ║
║  └─────────────────────┘ └─────────────────────┘                              ║
║  ┌───────────────────────────────────────────────┐                            ║
║  │ Pedidos de menor margen                        │  [ 7d / 30d / General ]   ║
║  └───────────────────────────────────────────────┘                            ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

## Estados operativos del pedido

El ciclo de vida que le importa al dueño: **creado → verificado → transportando
→ entregado**. Los 3 primeros son "no completados" y alimentan la card 1.1;
`entregado` es el estado completado. (`comision_pagada` es post-entrega y es de
dinero → no entra en la vista operativa.)

## Reglas derivadas que definimos (no existen como dato crudo)

1. **Transportista ocupado/disponible** — derivado de si tiene un pedido en
   `transportando`. No hay un campo de estado en `Transportista`.
2. **Sin chofer** — pedidos `verificado` sin `transportistaId`.
3. **Comisión atrasada** — días desde que el pedido pasó a `entregado` sin que
   se haya pagado la comisión.
4. **Pedido demorado** — antigüedad en la etapa actual por encima de un umbral
   (umbral por definir por etapa).

## Abierto / por confirmar

- Umbral de "demorado" por etapa (¿cuántos días sin avanzar dispara la alerta?).
- "Entra vs sale" y "Ciclo promedio": confirmados en Capa 3 bajo el filtro
  7d/30d (no como pulso de "hoy").

## Próximo paso

Bajar a plan de implementación: definir el nuevo view-model operativo, qué se
reusa (`buildStageDistribution`, `buildInventoryAlerts`, ranking/margen del
diseño actual) y los helpers nuevos (transportistas, comisión atrasada, pedidos
demorados, entra-vs-sale, ciclo promedio).
