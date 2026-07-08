# MVP — Sales Ops Cockpit

> Demo interactivo para presentarle a un dueño de negocio de ventas la potencialidad
> de digitalizar su operación. Frontend puro, sin backend, sin login, con datos
> pre-generados en el navegador. El demo se llena con **electrodomésticos**, reusando
> los productos y el estilo del catálogo que ya existe.

- **Fecha:** 2026-07-08
- **Estado:** Propuesta aprobada — pendiente de implementación
- **Propósito:** Anzuelo comercial. Mostrar el valor del sistema sin detalles técnicos
  para abrir la puerta a un contrato de implementación.

## Referencias (material fuente)

El material del negocio está en [reference/](reference/). Es la fuente de verdad para los
datos que siembra el demo — mantener actualizado:

- [reference/01-business-context.md](reference/01-business-context.md) — qué es el negocio y cómo opera hoy.
- [reference/02-sales-process.md](reference/02-sales-process.md) — las 8 etapas, roles, entidades, horarios.
- [reference/03-order-format.md](reference/03-order-format.md) — formato de pedido actual.
- [reference/04-commissions.md](reference/04-commissions.md) — tabla de comisiones por producto (MN).
- [reference/05-exchange-rates.md](reference/05-exchange-rates.md) — tasas de cambio y comportamiento.
- [reference/06-mvp-requirements.md](reference/06-mvp-requirements.md) — características y restricciones del MVP.

---

## 1. La idea en una frase

Hoy el negocio opera sobre un **grupo de WhatsApp**: alguien publica las ofertas cada
día, los gestores mandan pedidos en un formato de texto, las comisiones se calculan a
mano y la conversión de moneda se hace a ojo. No hay inventario centralizado, ni
finanzas, ni reportes, ni una vista para tomar decisiones.

El MVP muestra cómo ese caos se convierte en un **sistema digital ordenado**: cada rol
ve su parte del proceso, el pedido fluye por estados claros, el stock se valida solo, la
comisión se calcula sola y la conversión de moneda queda registrada. Y por encima de
todo, dos **dashboards** (decisiones y finanzas) que hoy no existen.

## 2. Objetivo del MVP

- Que el dueño **vea el flujo completo** de una venta, de punta a punta, por tipo de usuario.
- Que perciba las **bondades**: automatización, orden, control de inventario, y visibilidad
  financiera.
- Lograrlo con un **desarrollo rápido**, sin backend y con pasos de tareas simples.

## 3. Alcance

### Sí incluye
- 7 pantallas navegables (ver sección 5).
- Datos **sembrados** (generados una vez) que se **consumen** en toda la app.
- Interacción real del **flujo**: crear un pedido y moverlo por sus estados actuando
  como cada rol.
- Dos dashboards con datos de los últimos 20 días.

### No incluye (fuera de alcance del MVP)
- Autenticación / autorización / roles reales (se simula el rol eligiendo pantalla).
- Backend, base de datos, API. Todo vive en el navegador (localStorage).
- CRUD de datos maestros (gestores, transportistas, productos): vienen sembrados.
- SEO (no aplica a una herramienta interna; es del catálogo público).

## 4. El flujo por rol

Un pedido atraviesa estos estados:

```
creado  →  verificado  →  transportando  →  entregado (=pagado)  →  comisión pagada
```

| Estado           | Quién lo produce            | Qué significa                                         |
|------------------|-----------------------------|------------------------------------------------------|
| creado           | Gestor                      | Pedido armado y enviado.                              |
| verificado       | Operador de gestores        | Datos y stock revisados; **la tasa se congela aquí**.|
| transportando    | Operador de almacén         | Transportista asignado, en camino.                   |
| entregado (=pagado) | Operador de almacén      | Entregado al cliente y cobrado.                      |
| comisión pagada  | Operador de gestores        | Paso posterior: se liquida la comisión al gestor.    |

## 5. Las 7 pantallas

### Pantalla 1 — Gestor: crear pedido
Mini-flujo de 3 pasos:
1. **Carrito** — elige productos del catálogo de electrodomésticos + cantidad. Total en USD automático.
2. **Cliente** — nombre, teléfono, dirección, domicilio vs. recogida en almacén, forma de pago, ¿lleva cambio?, observaciones.
3. **Almacén** — solo puede elegir un almacén que tenga **todo el carrito disponible**.

**Regla de oro:** la disponibilidad se evalúa sobre TODO el carrito. Si ningún almacén
tiene todos los productos en cantidad suficiente, el pedido **no se puede crear**.
Al confirmar, nace en estado **creado**.

### Pantalla 2 — Operador de gestores
Tablero (tipo kanban, **sin drag & drop**) con los pedidos en columnas por estado
(las 5 columnas). Ve todos los pedidos. Acciones:
- **Revisar** un pedido `creado`: verifica todos los datos (incluido el contacto del
  gestor) y la disponibilidad del almacén.
- **Aceptar** → pasa a `verificado`. **En este momento se congela la tasa de cambio**
  vigente y se calcula el total en MN, que queda pegado al pedido.
- **Marcar comisión pagada**: paso final `entregado → comisión pagada`.

### Pantalla 3 — Operador de almacén
El mismo tablero, pero **filtrado a su almacén**: solo ve los pedidos aceptados para él
(`verificado → transportando → entregado`). Acciones:
- **Asignar transportista** → `verificado → transportando`.
- **Marcar entregado / pagado** → `transportando → entregado`.

### Pantalla 4 — Tasas de cambio
Las tasas actuales, editables:
```
USD → MN     680
Zelle        1 x 1
EUR          1 x 1
```
Son las que se aplican al **verificar** un pedido. **Editarlas NO recalcula** los pedidos
ya verificados: cada pedido conserva la tasa con la que se verificó. Las nuevas tasas
solo aplican a los que se verifiquen de ahí en adelante.

### Pantalla 5 — Inventario
- **Resumen general** de los 3 almacenes (unidades y valor).
- **Detalle por almacén** con semáforo disponible / agotado.
- **Valor de costo del inventario** (requiere un costo por producto en los datos sembrados).

### Pantalla 6 — Dashboard de decisiones
De un vistazo, lo que hoy no tiene para decidir:
- Ventas de los últimos 20 días (tendencia).
- Top productos vendidos.
- Ranking de gestores (ventas + comisiones).
- Ventas por almacén.
- Pedidos por etapa (embudo).
- Alertas de inventario bajo / agotado.

### Pantalla 7 — Finanzas
- Ingresos en USD y convertidos a MN.
- Desglose por moneda (MN / Zelle / EUR).
- Comisiones pagadas a gestores.
- Pagos a transportistas.
- Margen y flujo de caja de los últimos 20 días.
- Cobrado vs. pendiente.

## 6. Reglas de negocio clave

1. **Disponibilidad de carrito completo:** un almacén solo es elegible si cubre TODO el carrito.
2. **Tasa congelada al verificar:** la conversión USD→MN se hace y se fija al verificar; no se recalcula después.
3. **entregado = pagado:** el cobro ocurre en la entrega.
4. **Comisión aparte:** "comisión pagada" es un paso posterior a "entregado".
5. **Comisiones por producto:** monto fijo en MN según la tabla del negocio (ej. Refrigeradores 4000, TVs 3000, etc.).

## 7. Datos sembrados (modelo)

Todo se genera una vez y se guarda en localStorage. Un botón **"Reiniciar demo"**
regenera los datos.

- **Producto** — reusa el catálogo de appliances (`id`, `name`, `price` USD, `category`,
  `image`) + `commissionMN` (de la tabla de comisiones) + `costUSD` (para valor de inventario).
- **Almacén** (×3) — nombre, ubicación, horarios (recogida y trabajo en almacén).
- **Gestor** — nombre, teléfono, tarjeta, ventas acumuladas, comisión acumulada.
- **Transportista** — nombre, teléfono, zona, entregas activas.
- **Inventario** — producto × almacén → cantidad disponible.
- **Tasas de cambio** — USD→MN, Zelle, EUR (editable; único dato que el usuario modifica).
- **Pedido** — carrito (producto + cantidad), cliente, entrega, forma de pago, almacén,
  gestor, transportista, estado, total USD, tasa congelada, total MN, comisión, fechas.
- **Ventas históricas** — ~20 días de pedidos en distintos estados y monedas, para poblar los dashboards.

## 8. Stack técnico (breve)

- **App nueva dentro del monorepo `templates/`** (Turborepo + pnpm workspace `store-mgmt-template`),
  en `apps/` junto a `apps/static-store`. No es un repo aparte: es un app aislado que convive con
  el catálogo y **reusa los paquetes compartidos**.
- Mismo stack del catálogo: **React + Vite + TypeScript + Tailwind**.
- **React Router** para las 7 pantallas.
- **localStorage** para datos sembrados y estado del flujo.
- Librería de charts para los dashboards.
- Reusa `packages/storefront` (vista de productos / `ProductCard`) y `packages/domain`
  (datos y tipos de los productos de electrodomésticos).

## 9. Plan de tareas (pasos simples)

1. **Setup** — crear la app como un **nuevo paquete dentro del monorepo `templates/`**
   (Turborepo + pnpm workspace `store-mgmt-template`), en `apps/salesops-mvp`,
   junto a `apps/static-store`. Reusa los paquetes compartidos (`packages/storefront` para la
   vista de productos, `packages/domain` para datos/tipos, `packages/web-common` y las configs
   de `typescript-config` / `eslint-config`). Base Vite + Tailwind + Router; layout con barra
   lateral (7 pantallas).
2. **Modelo + seed** — tipos e generador de datos sembrados (productos, almacenes, gestores,
   transportistas, inventario, tasas, 20 días de pedidos). Persistir en localStorage + botón "Reiniciar demo".
3. **Pantalla 1 (Gestor)** — flujo de 3 pasos con validación de disponibilidad de carrito completo.
4. **Pantalla 2 (Operador de gestores)** — tablero de 5 columnas; acciones Revisar/Aceptar (congela tasa) y Comisión pagada.
5. **Pantalla 3 (Operador de almacén)** — tablero filtrado; Asignar transportista y Entregado/Pagado.
6. **Pantalla 4 (Tasas)** — edición de tasas actuales (sin recálculo retroactivo).
7. **Pantalla 5 (Inventario)** — resumen general + detalle por almacén + valor de costo.
8. **Pantalla 6 (Decisiones)** — gráficos y KPIs sobre los datos sembrados.
9. **Pantalla 7 (Finanzas)** — gráficos y KPIs financieros.
10. **Pulido** — datos de demo realistas, textos y detalles visuales que "vendan" al dueño.

## 10. Próximos pasos (post-MVP, para el contrato)

Autenticación real por rol, backend y base de datos, notificaciones, publicación de
ofertas del día, app para gestores, y reportes exportables. Nada de esto entra en el
demo — es la conversación que este MVP busca abrir.
