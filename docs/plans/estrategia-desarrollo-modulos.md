# Estrategia de desarrollo por módulos + estimación

> Del **MVP-demo** al **producto en producción**. Estimación realista en semanas
> calendario, anclada en el estado real del código.
> Compañero de [estrategia-pitch-mvp.md](estrategia-pitch-mvp.md) (cómo venderlo)
> y [mvp-sales-ops-cockpit.md](mvp-sales-ops-cockpit.md) (alcance del MVP).

## Punto de partida real (lo que YA está hecho)

| Ya resuelto en el MVP | Estado |
|---|---|
| 7 pantallas navegables (React 19 + React Router 7 + TS + Tailwind) | ✅ Andan |
| Lógica de negocio en funciones puras: carrito, comisiones, tasas con snapshot, inventario, dashboards | ✅ ~6.500 LOC, **67 archivos de test** |
| Dashboards de Decisiones y Finanzas | ✅ Verificados en navegador |
| Modelo de datos (tipos) del dominio | ✅ Definido en `app/domain/types.ts` |

**Esto acelera todo:** lo más riesgoso de un producto así — acertar el modelo de
negocio y las reglas (comisiones, tasas intradía, estados de pedido) — ya está
construido y probado. Se ahorran ~2–3 meses vs. arrancar de cero.

**Lo que falta (el grueso):** NO hay backend. Todo vive en `localStorage` (seed).
Falta persistencia real, auth, la app de gestores, y todo lo que un demo saltea.

## Supuestos de la estimación (leelos, cambian los números)

- **1 desarrollador full-stack senior**, dedicación enfocada. Con 2 devs, comprime
  ~35–40% (no 50%: hay coordinación).
- Semanas **calendario**, incluyen ciclos normales de feedback — **NO** incluyen
  demoras largas del cliente (el killer #1 de cronogramas).
- **Excluye**: costos de terceros (hosting, DB, push, WhatsApp Business API),
  carga de datos por el cliente, y cambios grandes de alcance.
- El demo actual (frontend + dominio) es un acelerador real y está acreditado abajo.

---

## Mapa de módulos y estimación

### Fase 0 — Discovery & fundaciones técnicas

| Módulo | Qué incluye | Estimado |
|---|---|---|
| M0.1 Relevamiento + modelo de datos definitivo | Datos reales del negocio, cerrar el esquema | 1–1.5 sem |
| M0.2 Stack backend + scaffolding | Elección de stack, repo, entornos, CI/CD, hosting, DB | 1–1.5 sem |
| **Subtotal** | | **2–3 sem** |

### Fase 1 — MVP a producción (primer valor real, lo que cobrás rápido)

| Módulo | Qué incluye | Estimado |
|---|---|---|
| M1 Backend + DB + API core | Modelo completo (productos, gestores, almacenes, pedidos+estados, comisiones, tasas con snapshot, pagos), endpoints, migraciones | 4–6 sem |
| M2 Auth + roles reales | Login, roles (gestor / op. gestores / op. almacén / dueño), gating por rol | 2–3 sem |
| M3a Cablear pantallas core al API | Las 2–3 que más duelen (nuevo pedido, operador gestores, un dashboard) + reemplazar seed | 2–3 sem |
| **Subtotal** | | **8–12 sem (~2–3 meses)** |

### Fase 2 — Producto completo

| Módulo | Qué incluye | Estimado |
|---|---|---|
| M3b Resto de pantallas + CRUD de datos maestros | Todas cableadas + alta/edición/baja de productos, gestores, transportistas, almacenes (**el MVP lo excluyó**) | 3–5 sem |
| M4 Módulo de tasas de cambio real | Gestión intradía, historial, snapshot por pedido, auditoría | 1–2 sem |
| M5 App para gestores (móvil) | Crear pedido, feed de ofertas, estados, login. **PWA recomendado** (reusa React); nativo cuesta bastante más | 5–8 sem |
| M6 Publicación de ofertas del día | Admin publica, gestores ven — reemplaza el WhatsApp | 2–3 sem |
| M7 Notificaciones | Push / WhatsApp Business API / email (estados, ofertas, comisión pagada) | 2–3 sem |
| M8 Reportes exportables | PDF/Excel de finanzas, comisiones, ventas | 2–3 sem |
| **Subtotal** | | **15–24 sem (~4–6 meses)** |

### Fase 3 — Hardening & salida a producción

| Módulo | Qué incluye | Estimado |
|---|---|---|
| M9 QA, seguridad, deploy, migración, capacitación | Testing e2e, performance, backups, monitoreo, migración de datos reales, capacitación al equipo, docs | 3–4 sem |
| **Subtotal** | | **3–4 sem** |

---

## Total (1 dev senior full-stack)

| Escenario | Tiempo | Cuándo usarlo |
|---|---|---|
| **Optimista** | ~28 sem (~6.5 meses) | Nunca lo cotices — es tu piso técnico |
| **Realista** | ~34–38 sem (~8–9 meses) | Tu expectativa interna |
| **Con colchón** | ~40–44 sem (~10 meses) | **Esto es lo que cotizás al cliente** |

> Con **2 devs**: realista ~5–6 meses. Nunca prometas el número optimista.

## Qué mueve el estimado (los riesgos honestos)

- **App de gestores (M5)** — es un cliente entero aparte y la mayor variable.
  **PWA** (reusa el React actual) es mucho más barato que **React Native** nativo.
  Empezá por PWA.
- **Notificaciones (M7)** — WhatsApp Business API implica aprobación + costo +
  tiempo. Email/push son más rápidos para arrancar.
- **Migración de datos** desde WhatsApp/cuadernos — manual y sucia. Scopealo
  explícito o se te come semanas.
- **Disponibilidad del cliente** para feedback — la causa #1 de atrasos. Sacala
  de tu estimado y dejala escrita como supuesto.

## Recomendación de secuencia (estratégica)

Entregá **Fase 1 rápido**: la pantalla que MÁS le duele al dueño, en producción,
con sus datos reales. Eso prueba valor, desbloquea el pago, y recién ahí te
comprometés con la cola larga (Fase 2). De-riesga para los dos: él ve resultados
antes de poner todo el dinero; vos cobrás por etapa antes de meter meses.

Mapa contra las fases comerciales del [pitch](estrategia-pitch-mvp.md):

| Fase comercial (pitch) | Módulos |
|---|---|
| Fase 0 — Discovery pago | M0 |
| Fase 1 — MVP a producción | M1, M2, M3a |
| Fase 2 — Producto completo | M3b, M4, M5, M6, M7, M8 |
| Fase 3 — Evolución | M9 + mantenimiento |
