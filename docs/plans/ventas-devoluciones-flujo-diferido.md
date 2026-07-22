# Flujo de Devolución (cancelar un pedido ya entregado) — DIFERIDO

> Nota de alcance para el módulo **Ventas** (`backend-ventas`). Documenta un flujo
> que se decidió **NO** implementar en el primer slice de Ventas y se deja anotado
> para un cambio futuro.

## Contexto

En el slice inicial de Ventas la máquina de estados del pedido es:

```
creado ──▶ verificado ──▶ entregado        (verificado congela tasa + totales)
   └──────────▶ cancelado ◀──────────┘
```

- `cancelado` es alcanzable **solo desde `creado` o `verificado`**.
- `entregado` es **terminal**.

El puente con Inventario (Opción A — reservar y consumir) funciona así en este slice:

| Transición | Efecto en Inventario |
|---|---|
| `verificado` | **reserva**: `reserved += qty` por línea |
| `entregado` | **consume**: `sale_out` (`onHand −= qty`) + libera la reserva (`reserved −= qty`) |
| cancelar desde `verificado` | **libera la reserva**: `reserved −= qty` |
| cancelar desde `creado` | sin efecto (no se tocó stock) |

## El flujo diferido: devolución de un pedido entregado

Cancelar un pedido que **ya fue entregado** NO es una simple cancelación: es una
**devolución/reembolso**, con implicaciones de stock **y** de dinero. Por eso se
difiere a un cambio futuro (probablemente su propio módulo/flujo, junto con
Delivery/Comisiones o un módulo de Devoluciones).

Cuando se implemente, debe cubrir:

1. **Stock:** la mercadería vuelve al inventario → `onHand += qty` por línea
   (movimiento compensatorio, p. ej. `adjustment_in` o un tipo `return_in`
   dedicado). Debe ser auditable, no un `onHand` mutado a mano.
2. **Dinero:** revertir los pagos y/o la `SaleCredit` asociada (reembolso). Definir
   si es reembolso total o parcial, y por qué canal se devuelve.
3. **Estado:** decidir si la transición es `entregado → cancelado` o un estado
   nuevo dedicado (`devuelto`), para no confundir una devolución con una
   cancelación temprana. Recomendación inicial: estado propio `devuelto`.
4. **Tasas:** el reembolso usa las tasas **congeladas** del pedido original (mismo
   principio de congelamiento), no las vigentes al momento de devolver.

## Por qué se difiere

- Mantiene el primer slice de Ventas chico y enfocado en la venta (crear, verificar,
  entregar, cancelar temprano).
- La devolución toca dinero (reembolsos) que hoy está fuera de alcance junto con
  pasarelas de pago, notas de crédito y el motor de impuestos.
- Evita comprometer el modelo de estados antes de tener el requisito real de
  devoluciones del negocio.

## Referencias

- Modelo de dominio de Ventas: memoria engram `sdd/backend-ventas/domain-model`.
- Estrategia de módulos: [estrategia-backend-por-modulos.md](estrategia-backend-por-modulos.md).
- Congelamiento de tasas: [monedas-tasas-cambio-design.md](monedas-tasas-cambio-design.md).
