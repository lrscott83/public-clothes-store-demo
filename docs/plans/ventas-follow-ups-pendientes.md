# Ventas — Follow-ups pendientes (post backend-ventas)

> Nota de alcance para el módulo **Ventas** (`backend-ventas`, ya archivado en
> `openspec/changes/archive/2026-07-22-backend-ventas/`). El slice base está
> completo, verificado (457 tests verdes, 0 CRITICAL) y pusheado a
> `origin/salesops-ventas` (sin PR). Este documento junta el trabajo que quedó
> **deliberadamente diferido** para arrancar la próxima sesión sin recontexto.

Relacionado: [Flujo de devolución (diferido)](./ventas-devoluciones-flujo-diferido.md).

## Estado de partida

- Rama: `salesops-ventas` (HEAD `ad226f6`), 7 commits work-unit, ciclo SDD cerrado.
- Verify: **PASS con warnings** — 0 CRITICAL, 4 WARNING, 2 SUGGESTION. Ninguno
  bloqueante. Los cuatro ítems de abajo son esas advertencias + un pendiente viejo.

---

## 1. W5 — Creación de venta *100% a crédito* (brecha funcional real)

**Qué pasa hoy:** `createOrder` exige `Σ pagos.amountInOrderCurrency === total` de
forma **incondicional**, incluso con `payments: []`. Entonces un pedido totalmente a
crédito (`total > 0`, sin pago inicial) tira `InvalidOrderError` y **no se puede
crear**. La entidad `SaleCredit` (FKs `orderId`/`customerId` + `isPaid`) SÍ está
enviada y testeada; lo que falta es relajar el invariante del agregado para admitirla.

- **Dónde:** `templates/packages/domain/src/ventas/order.ts:133-141` (el chequeo del
  payment-sum). Tests: no hay ninguno que combine `SaleCredit` + `createOrder`.
- **Spec:** ya enmendado honestamente como diferido en
  `openspec/specs/salesops-ventas/spec.md` → requisito "SaleCredit for Credit-Only
  Sales", nota "Deferred this slice" + escenario de cobertura.

**Propuesta (TDD, su propio commit):**
1. [RED] `order.test.ts`: un pedido con `SaleCredit` y `Σpagos < total` se crea; la
   `SaleCredit.total` cubre el remanente impago (`total_pedido − Σpagos`); `isPaid`
   arranca `false`.
2. [RED] borde: `Σpagos > total` sigue siendo `InvalidOrderError` (sobrepago inválido).
3. [GREEN] `order.ts`: relajar el invariante a `Σpagos <= total`; cuando
   `Σpagos < total`, **exigir** `SaleCredit` presente cubriendo el gap (si no hay
   `SaleCredit` y falta plata → `InvalidOrderError`). Congelar tasas igual que hoy.
4. Propagar al seed (`infra-db/src/ventas/seed.ts` ya tiene un pedido "credit sale"
   con pago balanceador — ajustarlo a credit-only real) y a un caso e2e.
5. Revertir la nota "Deferred" del spec al cerrar.

**Decisión de diseño a confirmar con el owner antes de codear:** ¿la `SaleCredit`
se deriva automáticamente del gap `total − Σpagos`, o el cliente la manda explícita?

---

## 2. W4 — Orden `release`→`sale_out` en `deliver` (correcto pero no verificado)

**Qué pasa hoy:** en `deliver`, por línea se hace `applyReservationTx('release')`
**antes** de `applyStockMovementTx(sale_out)` (ADR#4 — el orden es load-bearing en el
margen `onHand === reserved`). El código es correcto, pero **ningún test distingue el
orden**: ambos UPDATE guardados comparten un `$transaction`, así que un rollback se ve
igual sin importar el orden, y no hay test que pegue en el margen ajustado.

- **Dónde:** `templates/packages/infra-db/src/ventas/prisma-order.repository.ts`
  (transición `deliver`) + `apply-reservation.ts` / `apply-stock-movement.ts`.

**Propuesta:**
1. [RED] `prisma-order.repository.spec.ts`: fixture con `onHand === reserved` exacto
   (margen cero). Si el `sale_out` corriera antes del `release`, el guard
   `onHand + delta >= 0` fallaría → `NegativeStockError`. Con release-primero, pasa.
   Ese test hace observable el orden.
2. Defensa en profundidad: `CHECK (reserved <= on_hand)` **DEFERRABLE** en `stock_level`
   (migración aditiva). Documentar que es red de seguridad, no la garantía primaria.

---

## 3. W6 — Wording del spec: momento del rechazo por payment-sum (cosmético)

El spec dice que el rechazo del payment-sum ocurre "**when the order is verified**",
pero la implementación lo valida en `createOrder` (el `confirmOrder` no re-chequea).
Es funcionalmente equivalente (los pagos son inmutables post-creación, no hay PATCH de
líneas/pagos), pero el texto diverge del código.

- **Acción:** al tocar W5 (que reescribe justo esa zona del invariante), alinear el
  wording del requisito en `openspec/specs/salesops-ventas/spec.md` para decir
  "at order creation" en vez de "when verified". Cero código.

---

## 4. Pendiente viejo — Rewire de `customerId` en Ventas

Anterior a este slice: la `SaleCredit` legacy referenciaba al cliente por texto libre
(`client: string`). Ahora **ya existen** la entidad `Customer` (módulo Clientes) y el
agregado `Order` con `SaleCredit.customerId` como FK. Falta cerrar la promoción
end-to-end donde algún camino todavía asuma el texto libre.

- **Verificar primero:** `rg -n "client" templates/packages/domain/src/models/sale-credit.ts`
  y buscar consumidores del scaffold legacy `models/order.ts` / `models/sale-credit.ts`
  (recordar que su export del barrel se quitó en el commit `b30331b`).
- Si no queda ningún consumidor del texto libre, esto puede ser solo **borrar los
  scaffolds legacy** `models/order.ts` + `models/sale-credit.ts` (huérfanos) y cerrar.

---

## Orden sugerido para mañana

1. **W5** primero (es la única brecha funcional real; arrastra W6 en el mismo commit).
2. **W4** después (endurecimiento + test de margen; independiente).
3. **Rewire/limpieza de customerId** (probablemente solo borrar scaffolds huérfanos).

Cada uno en su propio commit work-unit sobre `salesops-ventas` (o rama nueva si el
owner prefiere separar), mismo criterio de entrega: sin PR salvo que se indique.
