# Estrategia — Mantenimiento del servicio y pricing mensual

- **Fecha:** 2026-07-15
- **Contexto:** App SalesOps a medida (cockpit de operaciones: pedidos, inventario,
  comisiones, finanzas, tasas). Hoy es un SPA de React; en producción necesita
  backend, autenticación, base de datos y hosting.
- **Escenario del pricing:** un cliente a medida (**retainer mensual**, no SaaS
  multi-tenant), PyME de **Latinoamérica**.
- **Propósito:** definir cómo mantener el servicio operativo y cuánto cobrar por
  mes, con números reales de mercado.

## 1. La verdad sobre "que siempre esté operativo"

Nadie promete barato que un sistema **nunca** se caiga. Lo que se vende es
**recuperación rápida + que casi nunca se note**. Se mide en "nueves":

| Nivel | Downtime/mes | Downtime/año | Qué requiere | Para quién |
|-------|-------------|-------------|--------------|-----------|
| 99.5% | ~3.6 h | ~1.8 días | Infra decente, monitoreo básico | Arranque muy chico |
| **99.9%** (tres nueves) | **~44 min** | **~8.8 h** | Infra sólida + buenas prácticas, sin redundancia exótica | **Estándar SaaS. Nuestro punto.** |
| 99.99% (cuatro nueves) | ~4.4 min | ~53 min | Failover automático, redundancia, monitoreo cada 30-60s, guardia | Cuando el cliente lo paga |

**Recomendación: 99.9% "best-effort".** El salto a 99.99% obliga a redundancia y
guardia 24/7 — multiplica costo y estrés, y una PyME rara vez lo necesita o lo
paga. Apuntar a 99.9% con recuperación en horas, y vender el SLA duro como un
**tier premium aparte** si algún día lo piden.

## 2. Costo real de infraestructura (lo que cuesta tenerlo vivo)

Componentes en producción: frontend (SPA), backend/API, Postgres y auth. Para
una PyME de **bajo tráfico** es barato:

| Componente | Opción | Costo/mes |
|-----------|--------|-----------|
| Frontend (SPA) | Vercel/Netlify/Cloudflare Pages (free) o Vercel Pro | $0–20 |
| Backend + DB + Auth + backups | **Supabase Pro** (Postgres + auth + storage + API, backups diarios) | **$25** |
| — alternativa | Railway Hobby ($5 + uso) + Neon ($15, Postgres serverless) | $20–30 |
| Monitoreo/uptime | Hyperping / OnlineOrNot / BetterUptime (free–básico) | $0–10 |
| Dominio + email | — | ~$2–5 |
| **Total realista** | | **~$30–75/mes** |

Presupuestar **$50–100/mes** con colchón. **El servidor NO es lo caro.** Lo que
se cobra es el tiempo y la garantía de que esté vivo.

## 3. Cuánto cobrar de mantenimiento

**Dos reglas de mercado:**

1. **% anual del costo de desarrollo:** 15–25%/año (Gartner/Forrester: 15–20%).
   Variante: 8–12%/año en retainer + features aparte pay-as-you-go.
2. **Managed IT / soporte gestionado:** típicamente **$500–2,000/mes** según
   complejidad — pero eso es para infra pesada; un app chico va al piso o menos.

**Sanity check con la regla del %:** si el build costó ~**$8k–25k** (razonable
para un dev LatAm), 15–20%/año = **$1,200–5,000/año = $100–420/mes** solo por la
regla.

**Tarifas dev LatAm (para calcular costo/hora):** senior $50–80/hr, mid
$35–55/hr. Argentina y Colombia, los más competitivos.

## 4. Recomendación — estructura de 3 tiers

Cobrar como **iguala mensual fija** (no por hora — previsibilidad para el cliente,
ingreso recurrente para vos), con la infra **incluida**:

| Tier | Precio/mes | Qué incluye | Disponibilidad |
|------|-----------|-------------|----------------|
| **Básico** | **$150–250** | Hosting + backups diarios + monitoreo + parches de seguridad + updates de dependencias + hasta ~2–3h de fixes. Respuesta: próximo día hábil. | Best-effort, recuperación en horas |
| **Estándar** ⭐ | **$300–500** | Todo lo anterior + más horas de fixes/ajustes chicos + respuesta a incidentes críticos en pocas horas. | Objetivo **99.9%** |
| **Premium (HA)** | **$800+** | Redundancia, failover, guardia extendida, SLA contractual con penalidades. | 99.99% / SLA duro |

**Desglose de margen (tier Estándar a $350/mes):**
- Infra: ~$50 (pass-through)
- Tiempo reservado: ~3–4h/mes de capacidad
- Resto: la prima del "siempre operativo" y la respuesta prioritaria
- → **~85% de margen sobre infra**; el costo real es el tiempo que efectivamente se use.

**Regla de oro:** el retainer cubre **mantener vivo lo que existe** (bugs,
parches, hosting, monitoreo). **Las features nuevas van por fuera**, cotizadas
aparte por hora o por proyecto. Sin esa línea, el retainer se convierte en
desarrollo gratis infinito.

## 5. Qué firmar (contrato de mantenimiento típico)

- **Alcance:** hosting gestionado, backups + restauración probada,
  monitoreo/alertas, parches de seguridad, updates de dependencias, corrección de
  bugs, N horas de ajustes menores.
- **Tiempos de respuesta (SLA blando):** crítico = pocas horas; normal = próximo
  día hábil.
- **Ventana de mantenimiento:** avisada, fuera de horario pico.
- **Exclusiones:** features nuevas, rediseños, integraciones nuevas → cotización
  aparte.
- **Revisión:** anual. El mantenimiento sube con la edad del sistema (10–25% en
  años 1–2, hasta 20–40% en años 6+).

## En una línea

Infra **~$50/mes**, cobrar **~$300–350/mes** (tier Estándar), disponibilidad
**99.9% best-effort** con backups y monitoreo, features nuevas **por fuera**. Ese
es el punto dulce para una PyME LatAm a medida.

## Fuentes

- [Savi — Software Maintenance Costs / regla Gartner](https://savibm.com/blog/software-maintenance-costs/)
- [Ptolemay — What App Maintenance Really Costs (2025)](https://www.ptolemay.com/post/application-maintenance-support-costs)
- [adevs — Software Maintenance Costs 2026](https://adevs.com/blog/software-maintenance-costs/)
- [The Network Installers — Small Business IT Support Pricing (2025)](https://thenetworkinstallers.com/blog/small-business-it-support-pricing/)
- [Curotec — LatAm Developer Hourly Rates](https://www.curotec.com/insights/latam-developer-hourly-rates-in-2025/)
- [Index.dev — LATAM Developer Rates 2025](https://www.index.dev/blog/latam-developer-hourly-rates)
- [Supabase — Pricing](https://supabase.com/pricing)
- [Techsy — Railway vs Render vs Fly.io](https://techsy.io/en/blog/railway-vs-render-vs-fly-io)
- [Webalert — 99.9% vs 99.99% uptime](https://web-alert.io/blog/uptime-sla-explained-99-9-vs-99-99-availability)
- [PingPing — Uptime SLA Explained](https://pingping.io/guides/uptime-sla-explained)
