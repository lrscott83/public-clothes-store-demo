# Reporte del seed de comisiones — para decisión del dueño

> Generado corriendo el seed real contra el catálogo de `appliances` (99 productos activos)
> en `store_mgmt_test`. **No es una estimación**: es exactamente lo que se escribiría en
> `product_commission_reference`.
>
> - Tabla de keywords (código): `templates/packages/infra-db/src/commission/seed.ts` → `COMMISSION_KEYWORD_TABLE`
> - Montos originales del negocio: `docs/plans/reference/04-commissions.md`
>
> **Cobertura: 83 de 99 productos.** Los 16 restantes no reciben fila y quedan como
> `unresolved` en el accrual — visibles en el reporte de comisiones, nunca como cero.

## Lo que hay que decidir

### 1. Los 16 productos sin comisión

El doc los cubriría con `Demás equipos pequeños | 1000`, pero eso es una **regla de fallback**,
no un producto. Sembrarla le pondría 1000 a cualquier cosa no configurada, que es justo lo que
este módulo existe para impedir. Hoy el gestor **no cobra nada** por estos:

- Freidora de Aire
- Freidora de Aire 4 lt
- Galón de combustible 20lt
- Juego de Calderos
- Licuadora
- Licuadora 2x1
- Licuadora Milexus 1.5 lt Cristal
- Licuadora Milexus 1.5L 2 en 1
- Olla Arrocera EKO 1.8L
- Olla Arrocera Milexus 2.2lt
- Olla Reina
- Olla Reina
- Olla de Presión 7lt
- Olla de Presión Bryderk 5.5lt
- Sandwichera
- Vajilla de Porcelana

**Opciones:** (a) fila explícita por familia — freidoras, licuadoras, ollas, etc.;
(b) una sola fila `utensilios de cocina | X`; (c) dejarlos sin comisión.

### 2. Los dos kits solares — probablemente pagan de menos

| Producto | Matchea | Paga | El doc sugiere |
|---|---|---|---|
| Kit 3.84KW: Inversor MUST 3KW + 2 Baterías 1.92KWh | `Inversores` | 5000 | 7000–20000 (tramos de kit) |
| Kit 5.12KW: Inversor MUST 3KW + Batería Humsienk 5.12KWh | `Inversores` | 5000 | 7000–20000 |

Los nombres del doc (`Kit 3 con 5`, `Kit Must 2 con 2.5`, …) no coinciden con ningún nombre
del catálogo, así que no hay forma de mapearlos sin que alguien diga cuál es cuál.

**Necesito:** el monto para cada uno de esos dos kits, o la equivalencia con una fila del doc.

### 3. Exhibidor Vertical 20P

Matchea `exhibidor` = **4000**. El doc tiene `Exhibidor 20 pies | 5000`. Sospecho que `20P`
son 20 pies y debería cobrar 5000, pero no lo asumo.

**Necesito:** confirmar 4000 o 5000.

---

## Las 83 que sí matchean

Agrupadas por la regla que disparó. Revisá que el monto de cada grupo sea el correcto.

| Regla | MN | # | Productos |
|---|---|---|---|
| Inversores | **5000** | 7 | Inversor 3KW<br>Inversor Solar 10KW<br>Inversor Solar 3.6KW<br>Inversor Solar 3.6KW<br>Inversor Solar 5KW<br>Kit 3.84KW: Inversor MUST 3KW + 2 Baterías 1.92KWh<br>Kit 5.12KW: Inversor MUST 3KW + Batería Humsienk 5.12KWh |
| Exhibidor 13.77 pies | **4000** | 1 | Exhibidor Vertical 20P |
| Refrigeradores | **4000** | 5 | Refrigerador<br>Refrigerador 9.1p<br>Refrigerador Doble Puerta 16P<br>Refrigerador Enerlife 10.5p No Frost<br>Refrigerador Inverter con Dispensador |
| Calentador de agua | **3000** | 1 | Calentador Eléctrico |
| Lavadora automática | **3000** | 5 | Lavadora automática<br>Lavadora automática<br>Lavadora automática<br>Lavadora automática<br>Lavadora automática |
| Lavadora semiautomática | **3000** | 4 | Lavadora Semi Automática<br>Lavadora Semi Automática<br>Lavadora Semiautomática 7kg<br>Lavadora semi Milexus 7kg |
| Lavadora/Secadora | **3000** | 1 | Lavadora/Secadora 10 KG |
| Neveras | **3000** | 3 | Nevera 3.5P Milexus<br>Nevera 5.5P Royal<br>Nevera Milexus 6 pies |
| Split | **3000** | 3 | Split 1T<br>Split 1T + Base<br>Split 1T Inverter |
| TVs | **3000** | 4 | Smart TV<br>Smart TV<br>Smart TV 40 pulgadas<br>Smart TV 43" HD |
| Ventilador Industrial | **3000** | 1 | Ventilador Industrial 30" Royal |
| Cocina de inducción | **2000** | 1 | Cocina de Inducción Milexus |
| Cocina infrarroja | **2000** | 1 | Cocina infrarroja |
| Contadora | **2000** | 1 | Máquina Contadora de Billetes |
| Dispensador de agua | **2000** | 1 | Dispensador con Filtro de Agua |
| Equipo de música LG | **2000** | 2 | Equipo de Música<br>Equipo de Música |
| Escalera 6 pasos | **2000** | 1 | Escalera 6 Peldaños |
| Escritorio | **2000** | 1 | Escritorio |
| Fogón de gas | **2000** | 1 | Fogón de gas Rudenkov |
| Hidrolavadora | **2000** | 1 | Hidrolavadora |
| Lámpara solar | **2000** | 8 | Luz recargable 100W<br>Lámpara Exterior Recargable Solar 100W<br>Lámpara Solar 800W<br>Lámpara exterior recargable solar 200W<br>Lámpara solar 1000W<br>Lámpara solar 200W<br>Lámpara solar 300W<br>Lámpara solar 300W |
| Microondas | **2000** | 1 | Microondas |
| Toldos | **2000** | 3 | Toldo Impermeable 280G/M2<br>Toldo Impermeable 280G/M2<br>Toldo Impermeable 280G/M2 |
| Fogón infrarrojo + olla | **1500** | 2 | Fogón Infrarrojo<br>Fogón Infrarrojo |
| Base de Paneles | **1000** | 2 | Base para Paneles - Estructura para 2 Paneles<br>Base para Paneles - Estructura para 4 Paneles |
| Base para Split | **1000** | 1 | Base para Split |
| Bomba de agua | **1000** | 2 | Bomba Periférica Silverpoint 1HP<br>Bomba de Agua 1/2 HP |
| Cajita decodificadora | **1000** | 1 | Cajita HD para TV |
| Escalera 4 pasos | **1000** | 1 | Escalera 4 Peldaños |
| Máquina de café expreso | **1000** | 1 | Máquina de Café Expreso Casera |
| Máquina de Refrigerador | **1000** | 1 | Máquina de frío EV1516WC |
| Ventilador normal | **1000** | 1 | Ventilador 18" |
| Bases de TV | **500** | 9 | Base Fija para TV<br>Base para TV a la Pared Giratoria<br>Smart TV + Cajita Decodificadora HD + Base de Pared Giratoria<br>Smart TV + Cajita Decodificadora HD + Base de Pared Giratoria<br>Smart TV + Cajita Decodificadora HD + Base de Pared Giratoria<br>Smart TV 32" + Base Giratoria<br>Smart TV 32" + Base Giratoria + Cajita HD<br>Smart TV 43" + Base Giratoria<br>Smart TV 43" HD + Base Giratoria + Cajita HD |
| Cafetera | **500** | 1 | Cafetera Eléctrica |
| Cafetera de fogón | **500** | 2 | Cafetera de fogón 3 tazas<br>Cafetera de fogón 6 tazas |
| Fogón de petróleo | **500** | 1 | Fogón de Petróleo |
| Lámparas | **500** | 1 | Lámpara Recargable 50cm |

---

## Filas de la tabla que no matchearon nada (25)

No es un error: son productos que el negocio vende pero que hoy no están en este catálogo
(`Bici-moto`, `Bolsa de Cemento`, `Colchón`, …). Se dejan por si el catálogo crece.

- Lavadora
- Baterías
- Panel Solar
- Exhibidor 20 pies
- Filtro de agua
- Ventilador de techo
- Fogón grande con horno
- Bici-moto
- Bicicleta
- Juego de muebles
- Juego de Baño
- Bolsa de Cemento
- Metro de azulejos
- Colchón
- Puerta
- Silla
- Bocina
- Secadora a Vapor
- Horno eléctrico
- Enfriador de aire grande
- Enfriador de aire pequeño
- Transfer
- Estaciones solas
- Cable (por metro)
- Base (accesorio)
