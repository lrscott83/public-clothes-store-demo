# Combos — modelado como conjunto de productos (diferido)

> Nota de alcance escrita durante `sales-agents-commissions` (rama
> `salesops-sales-agents-commissions`). El módulo de comisiones quedó funcionando
> **sin** este modelado: hoy un combo se resuelve por el NOMBRE del producto. Este
> documento junta lo que hay que hacer para modelarlo de verdad, para arrancar la
> próxima sesión sin recontexto.

Relacionado: [Follow-ups de Ventas](./ventas-follow-ups-pendientes.md) ·
[Comisiones (tabla del negocio)](./reference/04-commissions.md)

---

## 1. Qué es un combo — definición del dueño (2026-07-31)

> "Los combos los tenemos que modelar como un conjunto de productos (que puede ser
> de cada producto uno o más) con un precio único."

Tres piezas, y las tres importan:

1. **Un conjunto de productos** — no un producto suelto con nombre compuesto.
2. **Cantidad por componente** — de cada producto puede haber uno o más.
3. **Precio único** — el precio del combo es propio, no la suma de sus partes.

La comisión del combo tiene **dos modos posibles**, y el dueño dejó los dos abiertos:

- **(a) Por cantidad de equipos** — los tramos de `04-commissions.md:9-13`:
  1-2 equipos → 3000, 3-5 → 4000, 6-7 → 5000.
- **(b) Una comisión única para todo el combo** — un monto propio, igual que el precio.

No son excluyentes: lo más probable es que el combo tenga un monto propio cuando
alguien lo configuró, y caiga en los tramos cuando no. Eso es una decisión de
diseño pendiente, no algo a asumir.

---

## 2. Qué hay hoy — y por qué no alcanza

**Un combo es un string.** No existe la entidad: `rg -i "combo|bundle|composite"`
sobre `templates/packages/domain/src` y sobre `prisma/schema.prisma` no devuelve
nada. Un combo del catálogo es una fila común de `Product` cuyo NOMBRE junta las
piezas con `" + "`:

```
Smart TV 43" HD + Base Giratoria + Cajita HD
Split 1T + Base
```

El seed de comisiones cuenta esas piezas partiendo el nombre por `" + "`
(`countComboPieces`, `templates/packages/infra-db/src/commission/seed.ts`) y las
cobra por tramo. **Es una heurística sobre texto libre**, y se eligió a sabiendas:
sin modelo de combo era eso o pagar mal esos ocho productos — matcheaban
`base de pared` y cobraban 500 cuando su tramo es 3000-4000.

Lo que esa heurística NO puede hacer, y hay que decirlo:

- **No sabe qué contiene el combo.** Sabe que hay tres piezas porque hay dos `+`.
  No sabe que una es un TV de 43", ni cuántas unidades de cada una.
- **Se rompe con el nombre.** Renombrar el producto le cambia la comisión. Un
  `" +"` sin espacio a la derecha, o un nombre que use `/` o `y` en vez de `+`, deja
  de ser combo sin que nadie se entere.
- **Falsos positivos.** Cualquier producto futuro con un `+` decorativo en el nombre
  entra al bracket. Ya pasó una vez con los kits (se pagaban como combo de 2 piezas)
  y otra con `Fogón infrarrojo + olla de presión o calderos`, que el doc precia a
  1500 y el bracket cobraba 3000. Ambos se taparon con tablas que resuelven ANTES
  del bracket (`KIT_TABLE`, `NAMED_BUNDLE_TABLE`) — parches correctos, pero parches.

---

## 3. La consecuencia grave: el inventario cuenta dos veces

Esta es la razón de fondo para modelarlo, y no es la comisión.

`StockLevel` es por `(productId, warehouseId)` (`schema.prisma:130-141`). Como el
combo es un `Product`, **tiene stock propio**. Entonces hoy:

- El almacén tiene 10 TVs y 10 bases.
- Alguien carga 5 unidades del combo `Smart TV 43" + Base Giratoria`.
- El sistema cree que hay **15 TVs**: 10 sueltos y 5 escondidos dentro del combo.
- Vender el combo descuenta stock del combo. **No toca el TV ni la base.**

O sea: se puede vender el mismo televisor dos veces y el sistema no se entera. La
reserva de stock (`applyReservationTx`) valida contra el `onHand` del combo, que no
tiene relación con la existencia real de sus componentes.

Mientras los combos se carguen como SKU aparte con su propio conteo físico, esto no
explota. Depende de una convención humana, no de una invariante.

---

## 4. Hacia dónde va el modelo

Forma tentativa, a validar antes de codear:

```
Combo
  id, name, price (único, propio), active
  components: ComboComponent[]

ComboComponent
  comboId, productId, quantity (>= 1)
```

Y las preguntas que ese modelo tiene que contestar antes de existir:

- **Q1 — ¿El combo tiene stock propio o derivado?** La que decide todo lo demás.
  *Derivado*: la disponibilidad del combo es `min(stock_i / cantidad_i)` sobre sus
  componentes, y venderlo descuenta cada componente. Arregla el doble conteo, y
  obliga a tocar reserva, movimientos y disponibilidad.
  *Propio*: el combo se arma físicamente y se cuenta aparte; entonces hace falta una
  operación de **ensamblado** que mueva stock de los componentes al combo, si no
  vuelve el mismo problema por otra puerta.
- **Q2 — ¿El combo es un `Product` o una entidad aparte?** Si es `Product`, hereda
  categoría, precio, imagen y todo el catálogo gratis, pero hay que impedir que un
  `Product` con componentes se comporte como uno común. Si es aparte, hay que
  duplicar catálogo, listados y carrito.
- **Q3 — ¿Cómo aparece en el pedido?** ¿Una `OrderLine` con el `comboId` y precio
  único, o N líneas expandidas con precio prorrateado? Afecta devoluciones
  (¿se devuelve el combo entero o una pieza?) y el reporte de comisiones.
- **Q4 — ¿La comisión del combo es propia o por tramo?** Ver §1. Si es propia, va
  como `ProductCommissionReference` del combo y el bracket desaparece. Si es por
  tramo, el tramo se calcula sobre `Σ quantity` de los componentes — que es lo que
  el doc dice de verdad, ahora sí sobre datos y no sobre un string.
- **Q5 — ¿Qué pasa con los 8 combos que ya están en el catálogo?** Son productos
  reales hoy. Migrarlos a combos de verdad es una migración de datos con
  descomposición manual: alguien tiene que decir qué contiene cada uno.

---

## 5. Propuesta de trabajo (TDD, cuando se retome)

1. **Cerrar Q1 y Q2 con el dueño.** Sin eso no se escribe una línea: el modelo
   entero cuelga de si el stock es propio o derivado.
2. [RED] Dominio: disponibilidad de un combo a partir de sus componentes, con el
   caso borde de cantidad > 1 (`min(stock_i / cantidad_i)`).
3. [RED] Vender un combo descuenta **cada componente**, en su cantidad.
4. [RED] Un combo sin stock en uno solo de sus componentes no se puede vender.
5. [GREEN] Entidad + schema + migración.
6. [RED/GREEN] Comisión según lo que resuelva Q4.
7. **Recién ahí** sacar `countComboPieces` y `COMBO_BRACKETS` del seed, y con ellos
   `NAMED_BUNDLE_TABLE`: los tres existen solo porque el combo no está modelado.
   Borrarlos antes deja los ocho combos del catálogo cobrando 500.
8. Migrar los 8 combos existentes (Q5).

---

## 6. Estado al momento de escribir esto

- Rama `salesops-sales-agents-commissions`, 21 commits, **sin pushear**.
- El seed cubre 99/99 productos. Los combos cobran su tramo, los kits su tier.
- `design.md` §7.3 y Q3 ya registran que el bracket se sembró a nivel producto y que
  la regla a nivel ORDEN sigue sin implementarse (R17 lo fija).
- Nada de lo de acá bloquea el cierre del módulo de comisiones. El dueño lo dijo
  explícito: los montos sembrados son datos de ejemplo, editables.
- Pendiente relacionado ya anotado en `design.md` Q3: **no hay endpoint** para
  editar un `product_commission_reference`. El único camino de escritura es el seed.
