# store-mgmt

Monorepo pnpm + turbo. El código vive en [templates/](templates/) (`apps/*`, `packages/*`).
Los docs de diseño y estrategia viven en [docs/](docs/).

## Arquitectura — leer antes de agregar componentes

Antes de crear un **módulo de dominio, adapter de infraestructura, endpoint, package
o app**, leé el documento autoritativo de arquitectura:

> **[docs/system/architecture.md](docs/system/architecture.md)**

Define el patrón (hexagonal shared-kernel, espejando el proyecto hermano
`poolops-biz`), la distinción **packages vs apps**, y una tabla **¿Dónde va X?** que
dice exactamente dónde ubicar cada componente nuevo. Si lo que vas a crear no encaja
limpio en ese mapa, se discute el diseño antes de escribir código.

Regla base: **lógica de negocio pura en packages; delivery y wiring en apps; la
infraestructura entra por puertos que define el dominio.**
