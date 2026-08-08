# Pizzería Piloto — sitio promocional

Landing estática de una sola página. Su único trabajo es que la gente entre al grupo
de WhatsApp; el segundo, que sepan dónde queda el local.

No pertenece al monorepo de `templates/`. Es una carpeta independiente en la raíz del
repo: sin `package.json`, sin dependencias, sin paso de compilación.

**No hay servicio a domicilio.** Ese servicio no se presta por ahora y no debe
aparecer en el sitio en ninguna forma.

## Estructura

```
pizzeria-piloto/
├── index.html             ← EL SITIO — versión Brasa
├── versiones/
│   ├── index.html         ← índice para comparar
│   └── 01-sticker.html    ← alternativa descartada
├── assets/                ← el logo va acá (ver LEEME.txt)
├── docs/prompt.md         ← el encargo
└── README.md
```

Brasa vive en `index.html`, **no** en `versiones/`. Está una sola vez: dos copias del
mismo archivo se desincronizan al primer cambio.

## Verlo

```bash
python3 -m http.server 8080 --directory pizzeria-piloto
```

- El sitio: `http://localhost:8080/`
- Comparar con la descartada: `http://localhost:8080/versiones/`

Desde el teléfono, en la misma red: `http://<ip-de-tu-maquina>:8080/`.
Miralo ahí — el hero está diseñado para móvil y en pantalla ancha pierde efecto.

## Las versiones

**Brasa (activa).** Fondo casi negro con una sola fuente de luz: la boca del horno,
hecha con degradados radiales que respiran a ritmos distintos. Serif del sistema
(Georgia) en tamaño grande, filos de 1px, mucho aire. Sin ilustración — el calor es
la imagen. 5.0 KB comprimido.

**Sticker (descartada).** Contornos gruesos de tinta, colores planos y cálidos sobre
crema, sombras duras desplazadas, tarjetas apenas rotadas como calcomanías pegadas a
mano. Sans peso 900 con sombra dura. Energía de barrio. 7.2 KB comprimido.
Se conserva en `versiones/` por si se quiere volver.

## El logo

`assets/logo.png` **no está en el repo todavía**, y ninguna de las dos versiones
depende de él para funcionar.

Ambas usan una **marca SVG simplificada** embebida en el HTML: sirve de logo a 32 px
en la barra y de favicon, escala a cualquier tamaño y no cuesta ninguna petición de
red. A 32 px el logo ilustrado completo no se lee — los tomates y las nubes se vuelven
papilla —, así que la marca simplificada no es un atajo sino la solución correcta.

El PNG grande se usa solo en `og:image`: la vista previa cuando alguien comparte el
enlace por WhatsApp, que es donde el detalle sí importa. Ver `assets/LEEME.txt`.

## Antes de publicar

Los datos de contacto son de relleno en las dos versiones:

| Dato | Valor actual (falso) |
|---|---|
| Enlace del grupo | `https://chat.whatsapp.com/EJEMPLO0000000000000000` |
| Dirección | 1234 SW 8th St, Miami, FL 33135 |
| Horario | Lun a dom, 11:00 a.m. – 11:00 p.m. |

Buscá `TODO` en el HTML de la versión elegida. El enlace del mapa repite la dirección:
si cambiás una, cambiá el otro.

Después, Lighthouse en Chrome DevTools → **Mobile**. Objetivo: Performance ≥ 95,
Accessibility 100, Best Practices ≥ 95, SEO 100.

## Cómo están construidas

- HTML5 semántico, un archivo autocontenido con el CSS embebido en el `<head>`.
- Sin fuentes descargadas. Las dos usan stacks del sistema — es el mayor ahorro de
  peso y funcionan sin conexión.
- SVG inline dibujado a mano. Nada de librerías de íconos.
- ~15 líneas de JS para revelar secciones al hacer scroll. Si el script no corre,
  todo queda visible: el contenido nunca depende de él.
- Animaciones solo con `transform` y `opacity`, apagadas por completo con
  `prefers-reduced-motion: reduce`.

## Publicarlo

Es una carpeta estática: se sirve tal cual desde cualquier lado (Cloudflare Pages,
Netlify, GitHub Pages) apuntando a `pizzeria-piloto/`.

Si se quiere integrar al deploy existente de `dist-pages/`, hay que agregarle a
`scripts/build-pages-site.mjs` un tipo de target estático que copie la carpeta en vez
de correr `react-router build`. Ese script hoy alimenta los deploys de `salesops`,
`clothes` y `appliances` — tocarlo afecta a los tres.
