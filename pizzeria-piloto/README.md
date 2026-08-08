# Pizzería Piloto — sitio promocional

Landing estática de una sola página. Su único trabajo es que la gente entre al grupo
de WhatsApp; el segundo, que sepan dónde queda el local.

No pertenece al monorepo de `templates/`. Es una carpeta independiente en la raíz del
repo: sin `package.json`, sin dependencias, sin paso de compilación.

## Cómo verlo

```bash
python3 -m http.server 8080 --directory pizzeria-piloto
# http://localhost:8080
```

O abrí `index.html` directo en el navegador. Funciona igual: no hay build.

## Antes de publicar — tres cosas obligatorias

### 1. El logo

`assets/logo.png` **no está en el repo todavía.** Hay que agregarlo:

- Exportalo a **WebP o PNG, 400 px de ancho, por debajo de 40 KB**
  (pasalo por [squoosh.app](https://squoosh.app) si hace falta).
- Es el elemento LCP de la página: si pesa de más, se lleva puesta la métrica
  de rendimiento sin importar cuán liviano sea el resto.
- Si cambiás la extensión, actualizá las tres referencias en `index.html`
  (`og:image`, `icon`, `apple-touch-icon`) más el `<img>` del hero.

### 2. Los datos de contacto — hoy son de relleno

| Dato | Valor actual (falso) | Dónde está |
|---|---|---|
| Enlace del grupo | `https://chat.whatsapp.com/EJEMPLO0000000000000000` | líneas 559, 585, 597 |
| Dirección | 1234 SW 8th St, Miami, FL 33135 | línea 581, y repetida en el enlace al mapa (584) |
| Horario | Lun a dom, 11:00 a.m. – 11:00 p.m. | línea 582 |

El enlace del grupo **no funciona** y la dirección **no es la real**. Reemplazá las tres
apariciones del enlace de una sola vez:

```bash
sd 'https://chat.whatsapp.com/EJEMPLO0000000000000000' 'TU_ENLACE_REAL' index.html
```

La dirección aparece dos veces —el texto visible y la URL del mapa—: si cambiás una,
cambiá la otra o el enlace manda a la gente al lugar equivocado.

### 3. Lighthouse

Correlo en Chrome DevTools → Lighthouse → **Mobile**. Objetivo: Performance ≥ 95,
Accessibility 100, Best Practices ≥ 95, SEO 100.

## Cómo está construido

- HTML5 semántico, un solo archivo autocontenido con el CSS embebido en el `<head>`.
- Sin fuentes descargadas. El carácter tipográfico sale del peso 900, el tracking
  negativo y la sombra dura desplazada — cuesta 0 KB y funciona sin conexión.
- SVG inline dibujado a mano para el sol, el pin y los íconos. Nada de librerías.
- ~20 líneas de JS para revelar secciones al hacer scroll. Si el script no corre,
  todo queda visible: el contenido nunca depende de él.
- Todas las animaciones usan solo `transform` y `opacity`, y se apagan por completo
  con `prefers-reduced-motion: reduce`.

### Sobre el diseño

El logo es una porción de pizza volando como un cohete. De ahí sale el vocabulario del
sitio: el mercado es un **manifiesto de carga**, la sección de refrescarse del sol es
una **escala técnica**, y el llamado principal es un **pase de abordaje** troquelado
con CSS. Esa es la pieza que el sitio quiere que recuerdes — el resto se mantiene
callado para que destaque.

Las tarjetas van rotadas apenas, con borde de tinta grueso y sombra dura sin difuminar,
como calcomanías pegadas a mano. El giro se aplica con la variable `--giro` en vez de
`transform` directo, para que componga con la animación de revelado en lugar de pisarla.

## Publicarlo

Es una carpeta estática: se sirve tal cual desde cualquier lado (Cloudflare Pages,
Netlify, GitHub Pages) apuntando a `pizzeria-piloto/`.

Si se quiere integrar al deploy existente de `dist-pages/`, hay que agregarle a
`scripts/build-pages-site.mjs` un tipo de target estático que copie la carpeta en vez
de correr `react-router build`. Ese script hoy alimenta los deploys de `salesops`,
`clothes` y `appliances` — tocarlo afecta a los tres.
