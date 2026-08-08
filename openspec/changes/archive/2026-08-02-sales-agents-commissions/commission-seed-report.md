# Reporte del seed de comisiones

> Generado corriendo el seed real contra el catálogo de `appliances` (99 productos activos).
> **No es una estimación**: es exactamente lo que se escribe en `product_commission_reference`.
>
> - Reglas (código): `templates/packages/infra-db/src/commission/seed.ts`
> - Montos del negocio: `docs/plans/reference/04-commissions.md`
>
> **Cobertura: 99 de 99. Sin comisión: 0.**

## Cómo se resuelve un producto

Del más específico al más general. El primero que aplica gana:

1. **Kit con nombre propio** (`KIT_TABLE`) — 7000 a 20000. Va primero porque el nombre de un
   kit también junta partes con ` + `, y sin esto caería en el bracket de combo a 3000.
2. **Bundle con precio propio en el doc** (`NAMED_BUNDLE_TABLE`) — hoy solo
   `Fogón infrarrojo + olla de presión o calderos | 1500`. Va antes del bracket porque contar
   sus piezas lo cobraría 3000: el doble de lo que el negocio escribió.
3. **Combo** — si el nombre junta N piezas con ` + `: 1-2 → 3000, 3-5 → 4000, 6-7 → 5000.
   *(Confirmado por el dueño, 2026-07-30.)* Por encima de 7 el doc no dice nada y no se
   extrapola.
4. **Tabla de keywords ordenada** — el orden ES la precedencia. Los accesorios van arriba de
   `tv` y `split` para que un soporte suelto no cobre como televisor.
5. **Nada** — no se escribe fila. La línea queda `unresolved` en el accrual: visible, nunca cero.

Los pasos 2 y 3 cobran un bundle **vendido como un solo producto**. El bracket leído como regla
de ORDEN — una venta con N líneas sueltas — sigue sin implementarse a propósito: cada línea cobra
su propio tier.

No hay catch-all. Los equipos chicos de cocina (freidoras, licuadoras, ollas…) tienen filas
**explícitas** a 1000 en vez de la regla `Demás equipos pequeños` del doc — mismo dinero, pero
es configuración que alguien eligió y no un default que nadie ve. Un producto genuinamente
desconocido sigue resolviendo a nada.

## Qué cobra cada producto

Agrupado por la regla que disparó.

| Regla | MN | # | Productos |
|---|---|---|---|
| Kit de batería e Inversor | **8000** | 2 | Kit 3.84KW: Inversor MUST 3KW + 2 Baterías 1.92KWh<br>Kit 5.12KW: Inversor MUST 3KW + Batería Humsienk 5.12KWh |
| Exhibidor 20 pies | **5000** | 1 | Exhibidor Vertical 20P |
| Inversores | **5000** | 5 | Inversor 3KW<br>Inversor Solar 10KW<br>Inversor Solar 3.6KW<br>Inversor Solar 3.6KW<br>Inversor Solar 5KW |
| Combo de 3 equipos | **4000** | 5 | Smart TV + Cajita Decodificadora HD + Base de Pared Giratoria<br>Smart TV + Cajita Decodificadora HD + Base de Pared Giratoria<br>Smart TV + Cajita Decodificadora HD + Base de Pared Giratoria<br>Smart TV 32" + Base Giratoria + Cajita HD<br>Smart TV 43" HD + Base Giratoria + Cajita HD |
| Refrigeradores | **4000** | 5 | Refrigerador<br>Refrigerador 9.1p<br>Refrigerador Doble Puerta 16P<br>Refrigerador Enerlife 10.5p No Frost<br>Refrigerador Inverter con Dispensador |
| Calentador de agua | **3000** | 1 | Calentador Eléctrico |
| Combo de 2 equipos | **3000** | 3 | Smart TV 32" + Base Giratoria<br>Smart TV 43" + Base Giratoria<br>Split 1T + Base |
| Lavadora automática | **3000** | 5 | Lavadora automática<br>Lavadora automática<br>Lavadora automática<br>Lavadora automática<br>Lavadora automática |
| Lavadora semiautomática | **3000** | 4 | Lavadora Semi Automática<br>Lavadora Semi Automática<br>Lavadora Semiautomática 7kg<br>Lavadora semi Milexus 7kg |
| Lavadora/Secadora | **3000** | 1 | Lavadora/Secadora 10 KG |
| Neveras | **3000** | 3 | Nevera 3.5P Milexus<br>Nevera 5.5P Royal<br>Nevera Milexus 6 pies |
| Split | **3000** | 2 | Split 1T<br>Split 1T Inverter |
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
| Freidora de aire | **1000** | 2 | Freidora de Aire<br>Freidora de Aire 4 lt |
| Galón de combustible | **1000** | 1 | Galón de combustible 20lt |
| Juego de calderos | **1000** | 1 | Juego de Calderos |
| Licuadora | **1000** | 4 | Licuadora<br>Licuadora 2x1<br>Licuadora Milexus 1.5 lt Cristal<br>Licuadora Milexus 1.5L 2 en 1 |
| Máquina de café expreso | **1000** | 1 | Máquina de Café Expreso Casera |
| Máquina de Refrigerador | **1000** | 1 | Máquina de frío EV1516WC |
| Olla | **1000** | 2 | Olla Reina<br>Olla Reina |
| Olla arrocera | **1000** | 2 | Olla Arrocera EKO 1.8L<br>Olla Arrocera Milexus 2.2lt |
| Olla de presión | **1000** | 2 | Olla de Presión 7lt<br>Olla de Presión Bryderk 5.5lt |
| Sandwichera | **1000** | 1 | Sandwichera |
| Vajilla | **1000** | 1 | Vajilla de Porcelana |
| Ventilador normal | **1000** | 1 | Ventilador 18" |
| Bases de TV | **500** | 2 | Base Fija para TV<br>Base para TV a la Pared Giratoria |
| Cafetera | **500** | 1 | Cafetera Eléctrica |
| Cafetera de fogón | **500** | 2 | Cafetera de fogón 3 tazas<br>Cafetera de fogón 6 tazas |
| Fogón de petróleo | **500** | 1 | Fogón de Petróleo |
| Lámparas | **500** | 1 | Lámpara Recargable 50cm |

## Sin comisión

Ninguno.
