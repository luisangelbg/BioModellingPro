# Captura de pantalla de la app para el manual: abre index.html (file://) en un navegador sin ventana,
# ejecuta una receta (recetas/<nombre>.js) y guarda manual/img/<nombre>.png al doble de resolución.
# Uso (desde la carpeta de la app):
#   powershell -ExecutionPolicy Bypass -File manual\herramientas\captura.ps1 -Receta inicio [-Ancho 1400] [-Alto 900]
#     [-Tema light|dark] [-Idioma es|en] [-Recorte "x,y,ancho,alto"] [-Salida nombre]
# -Recorte se da en píxeles de pantalla (antes de duplicar la resolución).
param(
  [Parameter(Mandatory = $true)][string]$Receta,
  [int]$Ancho = 1400, [int]$Alto = 900,
  [string]$Tema = 'light', [string]$Idioma = 'es',
  [string]$Recorte = '', [string]$Salida = ''
)
$ErrorActionPreference = 'Stop'
$man = Split-Path $PSScriptRoot -Parent
$app = Split-Path $man -Parent
$archivoReceta = Join-Path (Join-Path $PSScriptRoot 'recetas') "$Receta.js"
if (-not $Salida) { $Salida = $Receta }
$png = Join-Path $man "img\$Salida.png"
& powershell -ExecutionPolicy Bypass -File (Join-Path $app 'tools\local\shot.ps1') -Out $png -SetupFile $archivoReceta -Theme $Tema -Lang $Idioma -Width $Ancho -Height $Alto -Scale 2 -Wait 2500 -SetupWait 700 | Out-Null
if ($Recorte) {
  Add-Type -AssemblyName System.Drawing
  $r = $Recorte.Split(',') | ForEach-Object { [int]([double]$_ * 2) }
  $img = [Drawing.Image]::FromFile($png)
  $bmp = New-Object Drawing.Bitmap $r[2], $r[3]
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($img, (New-Object Drawing.Rectangle 0, 0, $r[2], $r[3]), (New-Object Drawing.Rectangle $r[0], $r[1], $r[2], $r[3]), [Drawing.GraphicsUnit]::Pixel)
  $img.Dispose(); $g.Dispose()
  $bmp.Save($png, [Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}
Write-Output "img\$Salida.png"
