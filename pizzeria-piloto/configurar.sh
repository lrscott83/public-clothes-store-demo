#!/usr/bin/env bash
# Cambia los datos del negocio en index.html de una sola pasada.
#
# Los valores viven escritos en el HTML —no inyectados por JavaScript— para que
# buscadores y la vista previa de WhatsApp los lean. Este script es el "una sola
# fuente" que evita tener que buscarlos a mano uno por uno.
#
#   Uso:  bash configurar.sh
#
# Editá los cinco valores de abajo y ejecutalo. Es idempotente: podés correrlo
# las veces que quieras.

set -euo pipefail

# ----------------------------------------------------------------------------
# EDITÁ ESTO
# ----------------------------------------------------------------------------
GRUPO="https://chat.whatsapp.com/EJEMPLO0000000000000000"
DIRECCION_L1="1234 SW 8th St"
DIRECCION_L2="Miami, FL 33135"
HORARIO="Lunes a domingo, de 11:00 a.m. a 11:00 p.m."
CREDITO_NOMBRE="AutomatizaNegocio"
CREDITO_URL="https://automatizanegocio.com"
# ----------------------------------------------------------------------------

cd "$(dirname "$0")"
[ -f index.html ] || { echo "No encuentro index.html"; exit 1; }

python3 - "$GRUPO" "$DIRECCION_L1" "$DIRECCION_L2" "$HORARIO" \
           "$CREDITO_NOMBRE" "$CREDITO_URL" <<'PY'
import sys, re, pathlib, urllib.parse

grupo, dir1, dir2, horario, credito_nombre, credito_url = sys.argv[1:7]
p = pathlib.Path("index.html")
s = original = p.read_text(encoding="utf-8")

# El enlace del mapa se DERIVA de la dirección: nunca se escribe aparte, así no
# puede quedar apuntando a un lugar distinto del que muestra el texto.
mapa = "https://maps.google.com/?q=" + urllib.parse.quote_plus(f"{dir1}, {dir2}")

cambios = {}

s, cambios["GRUPO"] = re.subn(
    r'(href=")https://chat\.whatsapp\.com/[^"]*(")', rf'\g<1>{grupo}\g<2>', s)

s, cambios["DIRECCION"] = re.subn(
    r'(<p class="visita__dir">)[^<]*<br>[^<]*(</p>)',
    lambda m: f'{m.group(1)}{dir1}<br>{dir2}{m.group(2)}', s)

s, cambios["MAPA"] = re.subn(
    r'(href=")https://maps\.google\.com/\?q=[^"]*(")', rf'\g<1>{mapa}\g<2>', s)

s, cambios["HORARIO"] = re.subn(
    r'(<p class="visita__horario">)[^<]*(</p>)',
    lambda m: f'{m.group(1)}{horario}{m.group(2)}', s)

s, cambios["CREDITO"] = re.subn(
    r'(Hecho por <a href=")[^"]*(">)[^<]*(</a>)',
    lambda m: f'{m.group(1)}{credito_url}{m.group(2)}{credito_nombre}{m.group(3)}', s)

faltantes = [k for k, n in cambios.items() if n == 0]
if faltantes:
    print("  AVISO: no encontré estos puntos:", ", ".join(faltantes))
    print("  ¿Cambió la estructura del HTML? Revisá los comentarios CONFIG.")

if s != original:
    p.write_text(s, encoding="utf-8")

for k, n in cambios.items():
    print(f"  {k:<10} {n} reemplazo(s)")
print(f"\n  Mapa derivado de la dirección:\n  {mapa}")

if "EJEMPLO0000" in s:
    print("\n  PENDIENTE: el enlace del grupo sigue siendo el de relleno.")
PY
