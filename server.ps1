# Servidor web local minimo para BioModelling Pro.
# Uso:  clic derecho > "Ejecutar con PowerShell"
#       (o:  powershell -ExecutionPolicy Bypass -File server.ps1)
# Luego abre  http://localhost:9400  en el navegador.
#
# BioModelling Pro trae sus ejemplos incrustados, asi que
# el doble clic en index.html funciona igual. Este servidor solo hace falta para
# abrir la app desde otro equipo de la misma red.
#
# Para abrirlo tambien desde un celular o tablet (Android, iPad, Huawei...) en
# la MISMA red WiFi: ejecuta este script como Administrador (clic derecho >
# "Ejecutar como administrador" en lugar de "Ejecutar con PowerShell"). Asi el
# servidor escucha en toda la red, no solo en esta PC, y abajo te imprime la
# direccion (algo como http://192.168.1.23:9400) para escribirla en el
# navegador de la tablet. Si Windows pregunta por el Firewall, permite el
# acceso en redes "Privadas". Sin permisos de administrador, funciona igual
# pero solo en esta computadora.

param(
  [int]$Port = 9400,
  [string]$Root = $PSScriptRoot
)

Add-Type -AssemblyName System.Web
$listener = New-Object System.Net.HttpListener
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$lan = $false

if ($isAdmin) {
  try {
    $listener.Prefixes.Add("http://+:$Port/")
    $listener.Start()
    $lan = $true
  } catch {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$Port/")
  }
}
if (-not $lan) {
  if ($listener.Prefixes.Count -eq 0) { $listener.Prefixes.Add("http://localhost:$Port/") }
  try {
    if (-not $listener.IsListening) { $listener.Start() }
  } catch {
    Write-Host "No se pudo iniciar en el puerto $Port (quiza ya esta en uso). Prueba otro:  powershell -ExecutionPolicy Bypass -File server.ps1 -Port $($Port + 1)" -ForegroundColor Red
    exit 1
  }
}

$prefix = "http://localhost:$Port/"
Write-Host ""
Write-Host "  BioModelling Pro en marcha:  $prefix" -ForegroundColor Green
if ($lan) {
  $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '169.*' -and $_.IPAddress -ne '127.0.0.1' } |
    Select-Object -ExpandProperty IPAddress
  foreach ($ip in $ips) { Write-Host "  Desde tu celular/tablet (mismo WiFi):  http://${ip}:$Port/" -ForegroundColor Cyan }
} else {
  Write-Host "  (Solo en esta PC. Para abrirlo tambien desde una tablet, ejecuta este script" -ForegroundColor DarkYellow
  Write-Host "   como Administrador: clic derecho > Ejecutar como administrador.)" -ForegroundColor DarkYellow
}
Write-Host "  Carpeta servida   :  $Root"
Write-Host "  Para detener      :  cierra esta ventana o pulsa Ctrl+C"
Write-Host ""
try { Start-Process $prefix } catch {}

$mime = @{
  ".html"="text/html; charset=utf-8"; ".htm"="text/html; charset=utf-8";
  ".js"="text/javascript; charset=utf-8"; ".mjs"="text/javascript; charset=utf-8";
  ".css"="text/css; charset=utf-8"; ".json"="application/json; charset=utf-8";
  ".svg"="image/svg+xml"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg";
  ".gif"="image/gif"; ".webp"="image/webp"; ".ico"="image/x-icon";
  ".woff2"="font/woff2"; ".woff"="font/woff"; ".wasm"="application/wasm";
  ".md"="text/markdown; charset=utf-8"; ".csv"="text/csv; charset=utf-8";
  ".xlsx"="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  ".txt"="text/plain; charset=utf-8"
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $rel = [System.Web.HttpUtility]::UrlDecode($req.Url.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
      $path = Join-Path $Root $rel
      $full = [System.IO.Path]::GetFullPath($path)

      if (-not $full.StartsWith([System.IO.Path]::GetFullPath($Root))) {
        $res.StatusCode = 403; $res.Close(); continue
      }
      if ((Test-Path $full) -and (Get-Item $full).PSIsContainer) {
        $full = Join-Path $full "index.html"
      }
      if (Test-Path $full) {
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
        $res.Headers.Add("Access-Control-Allow-Origin", "*")
        $res.Headers.Add("Cache-Control", "no-cache")
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        Write-Host ("  200  " + $rel)
      } else {
        $res.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404: $rel")
        $res.OutputStream.Write($msg, 0, $msg.Length)
        Write-Host ("  404  " + $rel) -ForegroundColor DarkYellow
      }
    } catch {
      try { $res.StatusCode = 500 } catch {}
      Write-Host ("  ERR  " + $_.Exception.Message) -ForegroundColor Red
    } finally {
      try { $res.OutputStream.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
