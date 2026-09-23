# BioModelling Pro · manual de usuario: une las partes de un idioma en un solo documento para imprimirlo a PDF.
# Uso, desde la carpeta manual/:   powershell -ExecutionPolicy Bypass -File herramientas\unir-manual.ps1 es
#
# Hace lo mismo que unir-manual.pl (que necesita Perl, y en esta máquina no está instalado): escribe
# es/manual-completo.html con la portada (00a-portada.html) como primera hoja y las secciones de
# 00b-introduccion.html a 11-apendices.html en orden, con un solo paginar.js, para que la numeración de páginas
# sea continua y el índice general encuentre las páginas de todos los capítulos.
#
# Los estilos propios de cada parte se funden: un selector escrito igual en todas se conserva una vez; si dos
# capítulos le dan valores distintos (por ejemplo el ancho de figure.chica), gana la versión más frecuente y las
# otras se acotan a las hojas de su capítulo con .hoja[data-pestana="N"].
param([string]$Lang = 'es')

$ErrorActionPreference = 'Stop'
$dir = Join-Path (Get-Location) $Lang
if (-not (Test-Path $dir)) { throw "No existe la carpeta $dir. Ejecuta el script desde la carpeta manual/." }

$partes = Get-ChildItem $dir -Filter '*.html' |
  Where-Object { $_.Name -match '^(00b|\d\d)-' -and $_.Name -ne 'manual-completo.html' } |
  Sort-Object Name
if (-not $partes) { throw "No hay partes en $dir" }

$reglas = New-Object System.Collections.ArrayList
$cuerpo = New-Object System.Text.StringBuilder
$cabecera = $null

foreach ($p in $partes) {
  $t = Get-Content $p.FullName -Raw -Encoding UTF8
  if (-not $cabecera) { $cabecera = $t }

  # la pestaña del capítulo acota las reglas que solo valen en él
  $pest = $null
  $m = [regex]::Match($t, '<section class="capitulo"[^>]*data-pestana="([^"]+)"')
  if ($m.Success) { $pest = $m.Groups[1].Value }

  $ms = [regex]::Match($t, '(?s)<style>(.*?)</style>')
  if ($ms.Success) {
    $css = [regex]::Replace($ms.Groups[1].Value, '(?s)/\*.*?\*/', '')
    foreach ($r in [regex]::Matches($css, '([^{}]+)\{([^}]*)\}')) {
      $sel = ($r.Groups[1].Value -replace '\s+', ' ').Trim()
      $dec = ($r.Groups[2].Value -replace '\s+', ' ').Trim()
      if ($sel) { [void]$reglas.Add([PSCustomObject]@{ sel = $sel; dec = $dec; pest = $pest; arch = $p.Name }) }
    }
  }

  $i = $t.IndexOf('<body>'); $j = $t.LastIndexOf('</body>')
  if ($i -lt 0 -or $j -lt 0) { throw "$($p.Name) no tiene <body>" }
  $b = $t.Substring($i + 6, $j - $i - 6)
  $b = [regex]::Replace($b, '(?s)<script\b.*?</script>', '')
  [void]$cuerpo.AppendLine("`n<!-- ====================================================================== $($p.Name) -->")
  [void]$cuerpo.AppendLine($b)
}

# fusión de estilos: por selector, gana la declaración más repetida; las demás se acotan por capítulo
$css = New-Object System.Text.StringBuilder
$hecho = @{}
foreach ($r in $reglas) {
  if ($hecho.ContainsKey($r.sel)) { continue }
  $hecho[$r.sel] = $true
  $mismas = $reglas | Where-Object { $_.sel -eq $r.sel }
  $grupos = $mismas | Group-Object dec | Sort-Object Count -Descending
  [void]$css.AppendLine("  $($r.sel) { $($grupos[0].Name) }")
  foreach ($g in ($grupos | Select-Object -Skip 1)) {
    foreach ($x in $g.Group) {
      if (-not $x.pest) { throw "$($x.arch) redefine $($x.sel) y no tiene pestaña de capítulo" }
      $acotado = ($x.sel -split '\s*,\s*' | ForEach-Object { ".hoja[data-pestana=`"$($x.pest)`"] $_" }) -join ', '
      [void]$css.AppendLine("  $acotado { $($x.dec) }")
    }
  }
}

$ml = [regex]::Match($cabecera, '(?s)(<link rel="preconnect".*?<script src="\.\./paginar\.js"></script>)')
if (-not $ml.Success) { throw 'No encuentro el encabezado común (enlaces + paginar.js)' }
$links = $ml.Groups[1].Value

# la portada no se pagina: es una hoja propia, sin encabezado ni número, dibujada por su propio script
$portada = ''
$fPortada = Join-Path $dir '00a-portada.html'
if (Test-Path $fPortada) {
  $t = Get-Content $fPortada -Raw -Encoding UTF8
  $svg = [regex]::Match($t, '(?s)<section class="page cover"[^>]*>(.*?)</section>')
  $scr = [regex]::Match($t, '(?s)(<script>.*?</script>)')
  $fnt = [regex]::Match($t, '(<link href="https://fonts\.googleapis\.com[^>]*>)')
  if (-not $svg.Success -or -not $scr.Success) { throw '00a-portada.html no tiene la estructura esperada' }
  $portada = "<div class=`"hoja portada cover`" aria-label=`"Portada`">$($svg.Groups[1].Value)</div>`n$($scr.Groups[1].Value)`n"
  if ($fnt.Success) { $links = "$($fnt.Groups[1].Value)`n$links" }
  $ms = [regex]::Match($t, '(?s)<style>(.*?)</style>')
  if ($ms.Success) { [void]$css.AppendLine("  $($ms.Groups[1].Value)") }
  [void]$css.AppendLine('  .portada > svg { display: block; width: 100%; height: 100%; }')
}

$html = @"
<!doctype html>
<html lang="$Lang">
<head>
<meta charset="utf-8">
<title>BioModelling Pro · Manual de usuario</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- documento generado por herramientas/unir-manual.ps1: no se edita a mano; se corrigen las partes -->
$links
<style>
$($css.ToString())</style>
</head>
<body>
$portada$($cuerpo.ToString())
</body>
</html>
"@

$salida = Join-Path $dir 'manual-completo.html'
[System.IO.File]::WriteAllText($salida, $html, (New-Object System.Text.UTF8Encoding($false)))
$secciones = ([regex]::Matches($cuerpo.ToString(), '<section\b')).Count
"{0} partes, {1} reglas de estilo distintas, {2} secciones -> {3}" -f $partes.Count, $hecho.Count, $secciones, $salida
