# Encargo: sitio web promocional de "Pizzería Piloto"

Construí un sitio web de una sola página para **Pizzería Piloto**, una pizzería que además
funciona como mercado de barrio. El objetivo #1 del sitio es que la gente **se una al grupo
de WhatsApp**. El objetivo #2 es que sepan **dónde visitarnos**.

## Datos del negocio — ÚNICA FUENTE DE VERDAD

Todos los datos de contacto salen de acá. **No los escribas hardcodeados en varias partes
del sitio**: definilos una sola vez (constantes al inicio del script, o custom properties)
y reutilizalos. Si mañana cambia la dirección, se toca un solo lugar y el enlace al mapa
cambia con ella.

| Clave | Valor |
|---|---|
| `NOMBRE` | Pizzería Piloto |
| `WHATSAPP_GRUPO` | `https://chat.whatsapp.com/EJEMPLO0000000000000000` |
| `DIRECCION` | 1234 SW 8th St, Miami, FL 33135 |
| `HORARIO` | Lunes a domingo, 11:00 a.m. – 11:00 p.m. |

El enlace al mapa **se deriva** de `DIRECCION`, no se escribe por separado:
`https://maps.google.com/?q=` + `encodeURIComponent(DIRECCION)`

⚠️ `WHATSAPP_GRUPO` y `DIRECCION` son valores **inventados de relleno**. Ver la nota
al final del archivo.

## Restricción técnica dura

- **Sin librerías, sin frameworks, sin build step.** HTML + CSS + un mínimo de JS vanilla.
- **Cero imágenes de fotografía.** Todo el impacto visual sale de: CSS, tipografía,
  SVG inline dibujado a mano y emojis usados con criterio (no decorativos en cada título).
- **Peso total < 150 KB** incluyendo fuentes. Si una fuente no cabe en el presupuesto,
  usá stack de sistema y resolvelo con tipografía, no con archivos.
- Mobile-first de verdad: escribí los estilos base para 360px y subí con `min-width`.
- Animaciones ligeras (transform + opacity únicamente, nada que dispare layout).
  Respetá `prefers-reduced-motion: reduce` desactivándolas por completo.

## Objetivo de rendimiento

Probá con Lighthouse en modo **mobile** y ajustá hasta llegar a:

- Performance ≥ 95, Accessibility 100, Best Practices ≥ 95, SEO 100
- LCP < 2.0s, CLS < 0.05, TBT < 100ms

Corré Lighthouse, mostrame los números, arreglá lo que falle y volvé a correrlo.
No me digas que está optimizado sin pegarme el reporte.

## Paleta — extraída del logo

Es un logo tipo sticker/cómic: contornos gruesos azul tinta, colores planos y cálidos.
El sitio tiene que respirar ese mismo idioma visual.

```css
--tinta:      #3D3B62;  /* contornos y texto — el color que estructura todo */
--crema:      #F7DBAE;  /* fondo principal, cálido                          */
--crema-claro:#FDF1DC;  /* tarjetas y superficies elevadas                  */
--naranja:    #F5A623;  /* sol, corteza — el acento de energía              */
--naranja-hondo:#E8801C;
--tomate:     #E23B2E;  /* rojo pepperoni — urgencia, CTAs secundarios      */
--tomate-hondo:#C0392B;
--agua:       #A6DDE0;  /* estela, frescura — la sección de bebidas         */
--agua-hondo: #6FC5CC;
--aji:        #6DB33F;  /* verde, usado con moderación                      */
```

Cuidado con el contraste: texto claro sobre `--tomate` no llega a AA. Usá `--tomate-hondo`
con `--crema-claro` encima. Verificá cada par de colores contra WCAG AA (4.5:1 en texto
normal, 3:1 en texto grande).

## Dirección de diseño — y esto es lo que más me importa

**El sitio NO puede parecer hecho por una IA.** Lo que delata a un sitio generado:

- Gradiente violeta-azul de fondo. Prohibido.
- Todo centrado, hero con un titular enorme degradado y dos botones redondeados idénticos.
- Tarjetas todas iguales, con la misma sombra suave, en una grilla de 3 perfecta.
- Copy corporativo hueco: "experiencias inolvidables", "calidad excepcional",
  "sabor que trasciende". Nada de eso.
- Un emoji al inicio de cada encabezado.
- Inter / Poppins / Montserrat en todo el sitio.

En cambio, quiero:

- **Lenguaje de sticker impreso**: contornos gruesos de `--tinta` (3-4px) en tarjetas y
  botones, sombras duras y desplazadas (`box-shadow: 6px 6px 0 var(--tinta)`) en lugar
  de sombras difusas. Cero `border-radius` uniforme — variá.
- **Asimetría**: rotaciones sutiles (`transform: rotate(-1.5deg)`) en badges y tarjetas
  de oferta, como calcomanías pegadas a mano. Que no todo caiga en la misma grilla.
- **Una tipografía display con carácter** para titulares (chunky, con personalidad —
  pensá en rotulación de pizzería, no en SaaS) + stack de sistema para el cuerpo.
  Una sola fuente cargada, `woff2` subseteada a latín, `font-display: swap`, precargada.
- **Textura sin imágenes**: ruido o punteado con `repeating-linear-gradient` o un patrón
  SVG inline en data-URI de pocos bytes. Que el fondo crema no se vea plano y digital.
- **SVG dibujados a mano**, no íconos de librería: una porción de pizza, un pomo de
  refresco, una sombrilla, un ventilador. Trazo grueso irregular, mismo espíritu del logo.

## El hero — tiene que enganchar

Es lo primero y lo único que mucha gente va a ver. Requisitos:

- Legible y con el CTA visible **sin scrollear en 360×640**. Si el botón de WhatsApp
  queda debajo del pliegue en un teléfono chico, el hero falló.
- Un titular corto, con voz de barrio, que hable de pizza recién hecha. Nada de eslóganes
  genéricos. Que suene a persona, no a agencia.
- Una animación de entrada breve (< 600ms) — que la estela de la porción voladora se
  dibuje con `stroke-dashoffset`, o que el sol pulse muy lento. Sutil, una sola cosa.
  El texto debe estar legible desde el frame 0 (nada de fade-in en el titular: mata el LCP).
- **CTA primario**: "Únete al grupo de WhatsApp" → `WHATSAPP_GRUPO`
- **CTA secundario**: "Dónde visitarnos" → ancla a la sección de ubicación.

## Estructura y contenido

Escribí el copy vos, persuasivo y en **español natural y cercano** — el registro del propio
negocio, no traducido ni neutro. Frases cortas. Que se sienta escrito por el dueño.

**1. Hero** — pizza recién hecha + los dos CTAs.

**2. Las pizzas.** El argumento es que salen **acabadas de elaborar**, calientes, no
recalentadas. Destacá la oferta de la casa:
- **Pizza Napolitana** con agregado de jamón y cebolla
- **Pizzas familiares**

**3. El mercado.** Ofertas variadas, agrupadas en tres bloques:
- *Confituras y dulces*: pellys, leche condensada, sopas instantáneas, barras de guayaba
- *Básicos del hogar*: aceite, pan, espaguetis, fideos, variedad de sazones, café en polvo,
  pasta de tomate, salsa para pastas, huevos, jamonada de pollo, sal, azúcar
- *Bebidas*: ron, cerveza, refrescos de pomo y lata, energizantes, jugos, pomos de agua

**4. Refréscate del calor.** Esta sección es un gancho aparte, con el aqua como color
protagonista. Tres ideas: **bebidas bien frías** para este calor, **ofertas de entremeses**,
y **un lugar para reposar del sol** — sombra, sentarse, tomarse algo tranquilo.
Vendé la sensación de alivio, no la lista de productos.

**5. Servicio a domicilio.** Contamos con entrega a domicilio **con un costo adicional**.
Para coordinarlo hay que contactar a los administradores por el grupo.

**6. Dónde visitarnos.**

Mostrá `DIRECCION` y `HORARIO`, y un enlace al mapa derivado de `DIRECCION` como se
indica arriba. Repetí acá el CTA a `WHATSAPP_GRUPO`. Nada de iframe de mapa embebido — pesa muchísimo.
Un enlace y un SVG de pin dibujado a mano.

**7. Footer** breve, con el nombre y el enlace al grupo.

## Calidad de código

- HTML semántico: `header`, `main`, `section` con `aria-labelledby`, `footer`.
- CSS con custom properties, ordenado por sección, sin `!important`, sin selectores
  de más de 3 niveles. Comentarios solo donde el porqué no sea obvio.
- Estados `:focus-visible` visibles en todo lo interactivo. Navegable con teclado.
- Todo el CSS crítico inline en el `<head>` si eso mejora el LCP; medí antes de decidir.
- Meta tags de Open Graph para que el enlace se vea bien cuando lo compartan por WhatsApp
  (que es exactamente como va a circular este sitio).
- Un solo archivo `index.html` autocontenido, salvo que separar mejore la métrica.

## Entrega

1. El sitio funcionando.
2. El reporte de Lighthouse mobile con los números reales.
3. Las decisiones de diseño que tomaste y por qué — en dos o tres líneas, sin relleno.

---

## ⚠️ DATOS INVENTADOS — reemplazar antes de publicar

`WHATSAPP_GRUPO` y `DIRECCION` (definidos arriba, en **Datos del negocio**) son valores
ficticios, puestos solo para poder maquetar y probar el sitio.

- El link del grupo **no funciona** — dice literalmente `EJEMPLO`.
- La dirección **no es la del negocio real**. La calle y el ZIP existen; el número `1234`
  es de relleno.

Se cambian en un solo lugar: la tabla de **Datos del negocio**. Hacelo antes de publicar.
