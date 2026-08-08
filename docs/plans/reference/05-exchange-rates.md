# 05 — Tasas de cambio

- El **precio de los productos es en USD**.
- El negocio comparte el cambio del USD contra otras monedas.
- Las tasas **pueden variar incluso dentro del mismo día**.

## Ejemplo de tasas

| Moneda | Tasa (respecto a USD) |
|--------|------------------------|
| USD    | base                   |
| MN     | 680                    |
| Zelle  | 1 x 1                  |
| EUR    | 1 x 1                  |

## Comportamiento en el MVP

- Las tasas actuales son **editables** (Pantalla 4).
- La conversión USD→MN se hace y se **congela al verificar** un pedido (Pantalla 2).
- Cambiar las tasas **no recalcula** los pedidos ya verificados: cada pedido conserva la tasa
  con la que se verificó. Las nuevas tasas solo aplican a los pedidos que se verifiquen después.
