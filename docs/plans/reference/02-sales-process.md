# 02 — Proceso de venta, roles y entidades

## Las 8 etapas actuales (proceso manual)

1. Mandan el pedido a la operadora de los gestores, a un almacén.
2. Verifican la existencia y todos los datos.
3. Crean el pedido.
4. Gestionan quién lo transporta.
5. Envían el o los productos.
6. Cobran el producto.
7. Entregan el dinero.
8. Entregan la comisión al gestor.

> En el MVP este proceso se **reimagina** y se digitaliza por rol. La correspondencia con los
> estados del sistema está en el plan ([../mvp-sales-ops-cockpit.md](../mvp-sales-ops-cockpit.md), sección 4).

## Qué deben controlar

- Los **gestores**.
- Los **transportistas** (y a qué transportista se le puede asignar una entrega).
- Todo el **inventario** de cada uno de los 3 almacenes.
- El **pago de comisiones** a los gestores.
- El **pago a los transportistas**.

## Actores que pueden insertar una venta

- Los **gestores de ventas**.
- Los propios **clientes**.
- Los **usuarios del mismo almacén**.

## Horarios

- Un **horario semanal para la recogida de pedidos**.
- Un **horario semanal para el trabajo en los almacenes** (incluye el caso en que el cliente
  desea buscar el producto directamente en el almacén).

## Otros requerimientos mencionados

- **Reportes**.
- **SEO** — nota: no aplica a la herramienta interna del MVP (es del catálogo público);
  queda fuera de alcance del demo.
