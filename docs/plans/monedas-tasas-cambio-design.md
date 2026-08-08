# Diseño — Módulo Monedas y Tasas de Cambio

> Primer módulo del backend de salesops-mvp (capa base). Define el modelo de
> monedas, canales de pago y tasas de cambio, más el resolvedor que el resto del
> sistema usa para convertir dinero. Diseño validado sección por sección.
>
> Contexto general: [estrategia-backend-por-modulos.md](./estrategia-backend-por-modulos.md) ·
> Regla de negocio actual: [reference/05-exchange-rates.md](./reference/05-exchange-rates.md)

## 1. Contexto y alcance

salesops **vende electrodomésticos**; NO es una casa de cambio ni una remesadora.
La tasa de cambio existe con un único propósito: **liquidar ventas** — saber cuánto
paga el cliente en su forma de pago y cuánto MN entra al negocio (para comisiones y
finanzas). Es una sola dirección; el negocio no gana en el spread del cambio.

Este módulo es **base** (sin dependencias): otros módulos (Ventas, Finanzas) lo
consumen, él no consume a nadie.

## 2. Evaluación del estudio de referencia

Se evaluó un estudio externo que proponía un "Motor de Liquidación Financiera". El
estudio es sólido pero está escrito para una **casa de cambio / billetera**, no para
una tienda. Separamos señal de ruido:

**Adoptado (aplica a salesops):**
- **El canal de pago como dimensión de la tasa.** La misma moneda puede tener
  distinta tasa según cómo se paga (MN efectivo ≠ MN transferencia). Confirmado por
  el dueño.
- **Inmutabilidad / versionado temporal** ("nunca UPDATE, siempre INSERT"). Coincide
  con la regla de congelamiento existente.
- **Precisión decimal, nunca float.** Universalmente correcto; hoy no se cumple.
- **Fallback en cascada** para resolver tasas.

**Descartado (sobre-ingeniería para este dominio — YAGNI):**
- **`buy_rate` / `sell_rate` (spread compra/venta).** Asume comprar y vender divisa
  como negocio. salesops solo liquida ventas en una dirección.
- **Caché distribuido (Redis) por "miles de consultas por segundo".** El negocio
  hace 3-6 pedidos por día. La premisa de escala no existe.
- **Límites por canal / risk management.** Concepto de billetera que mueve dinero
  como servicio. No aplica.
- **Wallet / balances de usuario.** En salesops el cliente no tiene saldo.
- **Bitemporalidad estricta (`valid_to`).** Innecesaria; ver §5.

## 3. Decisiones tomadas

| Decisión | Resolución |
|---|---|
| Rol de la tasa | Solo liquidar ventas (sin spread) |
| ¿Canal cambia la tasa? | Sí — el canal es una dimensión de la tasa |
| Moneda del precio | Cualquiera (USD, MN o EUR), según cómo se venda |
| Almacenamiento de tasas | Pivote interno USD (hub) — evita matriz N×N |
| Monto + moneda | Van juntos y livianos: `{ cantidad, moneda }` |
| Historia de tasas | Append-only + snapshot en el pedido |
| Resolución | Cascada de fallback + error explícito si no hay tasa |
| Congelamiento | Vive en el Pedido (Ventas); Tasas solo resuelve |
| Precisión | Decimal en DB, unidades mínimas en dominio, string en API |

## 4. Modelo de dominio

**`Money` (Monto)** — value object liviano: `{ cantidad, moneda }`. Un precio, un
pago, un total: todos son `Money`. Regla: **ningún monto anda solo**; la moneda
viaja pegada al número. Evita el bug clásico de sumar EUR con MN. En DB son dos
columnas (`amount`, `currency`).

**`Currency` (Moneda)** — `USD`, `MN`, `EUR`. Una marcada como **base/pivote**
interna (USD). Aclaración: base ≠ "los precios son en USD"; base = "el hub contra el
que se guardan las tasas".

**`PaymentChannel` (Canal / forma de pago)** — cómo entra la plata y en qué moneda
liquida:

| Canal | Liquida en |
|---|---|
| `ZELLE` | USD |
| `USD_EFECTIVO` | USD |
| `EUR_EFECTIVO` | EUR |
| `MN_TRANSFERENCIA` | MN |
| `MN_EFECTIVO` | MN |

(Lista a confirmar — ver §11.)

**`ExchangeRate` (Tasa)** — UNA tasa (sin buy/sell), expresa el valor de un
canal/moneda **contra el pivote**, con vigencia en el tiempo. Clave:
`canal (+ moneda) + efectivaDesde`; valor: `tasa` (decimal).

**Conversión:** cualquier `Money` en moneda A, pagado por canal C, se convierte
`A → pivote(USD) → destino`. El destino habitual es MN.

## 5. Persistencia — registro append-only + snapshot

La tabla de tasas es **inmutable**: cada cambio es una fila nueva
(`canal`, `tasa`, `efectivaDesde`). La "tasa vigente" de un canal es su última fila.

- Da la inmutabilidad del estudio ("nunca UPDATE, siempre INSERT") **sin** la
  contabilidad de `valid_to`.
- Auditoría real de cambios de tasa ("¿qué tasa puse el martes?").
- La tasa en el momento T = última fila con `efectivaDesde <= T`.

Se descartó la bitemporalidad estricta (B) porque no hay necesidad de correcciones
retroactivas para 3-6 pedidos/día.

## 6. Resolvedor de tasas

Única puerta por la que el sistema convierte dinero. Dos funciones puras (sin I/O):

**`resolverTasa(canal, momento) → tasa`** — con fallback en cascada:
1. ¿El canal tiene tasa propia? → usarla.
2. ¿No? → caer a la tasa de su moneda (ej. `USD_EFECTIVO` → tasa de USD = 1).
3. ¿Tampoco? → **error explícito.** Nunca devolver 0 ni null: en finanzas, el
   sistema grita, no adivina.

**`convertir(Money origen, canal, monedaDestino, momento) → Money destino`** —
convierte pasando por el pivote.

Encaja en el seam existente: son funciones puras `(tasas, inputs) → resultado`, el
mismo patrón que los builders de dashboards ([finanzas-dashboard.ts](../../templates/apps/salesops-mvp/app/domain/finanzas-dashboard.ts)).

## 7. Congelamiento y frontera con Ventas

**El módulo de Tasas solo RESUELVE. El Pedido (Ventas) CONGELA.**

1. Pedido en `creado` → muestra tasas vigentes/indicativas (en vivo).
2. Pedido pasa a `verificado` → Ventas pide la tasa al resolvedor y **estampa en el
   pedido** todo lo necesario para reproducir el cálculo: canal usado, tasa aplicada
   + `efectivaDesde` (rastro), y los `Money` resultantes (totalMN, comisión…).
3. Desde ahí el pedido carga sus números congelados; el módulo de Tasas puede
   cambiar y ese pedido no se entera.

Patrón puente (de la estrategia): **Tasas NO conoce a los pedidos.** Cero
acoplamiento inverso → módulo independiente y testeable solo. Generaliza el
`exchangeRateSnapshot` actual (que hoy guarda solo `usdToMn`).

## 8. Precisión decimal

Hoy [types.ts](../../templates/apps/salesops-mvp/app/domain/types.ts) usa `number`
(float) para plata — deuda a corregir. Regla en tres bordes:

- **DB:** `DECIMAL`/`NUMERIC`, nunca float.
- **Dominio:** matemática decimal-safe; **redondear una sola vez, en puntos
  definidos** (al congelar), no en cada paso intermedio.
- **API (JSON):** montos y tasas como **strings** (`"350.455"`).

Reglas por moneda a fijar: **escala** (USD 2, EUR 2, MN por confirmar) y **modo de
redondeo** único para todo el sistema (ej. mitad-arriba).

Representación en el dominio: preferencia por **unidades mínimas** (enteros) por
exactitud; se afina al implementar.

## 9. Fuera de alcance (explícito)

Spread compra/venta · caché distribuido/Redis · límites por canal · wallet/balances
· bitemporalidad `valid_to` · integraciones con rieles de pago reales. Ninguno entra
en este módulo.

## 10. Encaje con el código actual

- El resolvedor entra en el mismo seam que los builders puros existentes.
- Reemplaza el tipo `ExchangeRates { usdToMn, zelle, eur }` por el modelo de §4.
- Generaliza `Order.exchangeRateSnapshot` (§7).
- El generador de seed sigue sirviendo como fixture de tasas para pruebas.

## 11. A confirmar antes de implementar

- **Lista exacta de canales** (formas de pago reales del negocio).
- **Escala decimal de MN** (¿2 decimales? ¿0?).
- **Modo de redondeo** definitivo.

## 12. Testing (Strict TDD)

- Resolvedor: tasa vigente por momento, cascada de fallback, **error explícito** sin
  tasa (nunca 0/null).
- Conversión vía pivote entre pares arbitrarios (USD/MN/EUR).
- Congelamiento: un pedido verificado no se recalcula al cambiar tasas.
- Precisión: sin drift por redondeo intermedio; redondeo único al congelar.
