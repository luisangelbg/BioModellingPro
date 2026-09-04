# Servidor web local mínimo para BioSDM.
# Uso:  clic derecho > "Ejecutar con PowerShell"   (o:  powershell -ExecutionPolicy Bypass -File servidor.ps1)
# Luego abre http://localhost:8765 en Chrome o Edge.
#
# Sirve para el Bloque A (opcional: también funciona con doble clic en index.html)
# y será NECESARIO para los bloques con Python (Pyodide).

param(
  [int]$Port = 8765,
  [string]$Root = $PSScriptRoot
)

Add-Type -AssemblyName System.Web
$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host "No se pudo iniciar en el puerto $Port. Prueba otro:  .\servidor.ps1 -Port 9000" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "  BioSDM en marcha:  $prefix" -ForegroundColor Green
Write-Host "  Carpeta servida :  $Root"
Write-Host "  Para detener    :  cierra esta ventana o pulsa Ctrl+C"
Write-Host ""

$mime = @{
  ".html"="text/html; charset=utf-8"; ".htm"="text/html; charset=utf-8";
  ".js"="text/javascript; charset=utf-8"; ".mjs"="text/javascript; charset=utf-8";
  ".css"="text/css; charset=utf-8"; ".json"="application/json; charset=utf-8";
  ".geojson"="application/geo+json; charset=utf-8"; ".svg"="image/svg+xml";
  ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif";
  ".webp"="image/webp"; ".ico"="image/x-icon"; ".woff2"="font/woff2"; ".woff"="font/woff";
  ".tif"="image/tiff"; ".tiff"="image/tiff"; ".wasm"="application/wasm";
  ".md"="text/markdown; charset=utf-8"; ".csv"="text/csv; charset=utf-8"; ".txt"="text/plain; charset=utf-8"
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
