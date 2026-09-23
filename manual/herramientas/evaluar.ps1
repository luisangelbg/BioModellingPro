# Abre una página de la app (file://) en un navegador sin ventana, ejecuta un guion (puede devolver una promesa)
# y escribe su resultado. Uso (desde la carpeta de la app):
#   powershell -ExecutionPolicy Bypass -File manual\herramientas\evaluar.ps1 -ScriptFile guion.js [-Page index.html] [-Width 1400] [-Height 900] [-Out salida.txt]
# Con -ScriptFile manual\herramientas\huecos.js -Page manual/es/01-bloque1.html informa el hueco al pie de cada hoja.
# La ventana no muestra barras de desplazamiento, como la de captura.ps1, para que las medidas coincidan con las capturas.
param(
  [Parameter(Mandatory = $true)][string]$ScriptFile,
  [string]$Page = 'index.html', [string]$Lang = 'es', [int]$Wait = 2500, [int]$Port = 9336, [int]$Width = 1400, [int]$Height = 900,
  [string]$Out = ''
)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$browser = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$profileDir = Join-Path $env:TEMP 'breedingpro-eval'
$url = 'file:///' + (Join-Path $root $Page).Replace([string][char]92, '/').Replace(' ', '%20')
$proc = Start-Process -FilePath $browser -PassThru -ArgumentList @('--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', "--remote-debugging-port=$Port", "--user-data-dir=$profileDir", 'about:blank')
$script:nextId = 0
function Invoke-Cdp($ws, [string]$method, $params) {
  $script:nextId++; $id = $script:nextId
  $msg = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 8 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
  $ws.SendAsync((New-Object ArraySegment[byte] -ArgumentList (, $bytes)), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
  $buf = New-Object byte[] 4194304
  while ($true) {
    $ms = New-Object IO.MemoryStream
    do { $r = $ws.ReceiveAsync((New-Object ArraySegment[byte] -ArgumentList (, $buf)), [Threading.CancellationToken]::None).GetAwaiter().GetResult(); $ms.Write($buf, 0, $r.Count) } while (-not $r.EndOfMessage)
    $txt = [Text.Encoding]::UTF8.GetString($ms.ToArray())
    $m = $txt | ConvertFrom-Json
    if ($m.id -eq $id) { return @{ obj = $m; raw = $txt } }
  }
}
try {
  $target = $null
  for ($i = 0; $i -lt 50 -and -not $target; $i++) { Start-Sleep -Milliseconds 200; try { $target = (Invoke-RestMethod "http://127.0.0.1:$Port/json/list") | Where-Object { $_.type -eq 'page' } | Select-Object -First 1 } catch {} }
  $ws = New-Object Net.WebSockets.ClientWebSocket
  $ws.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
  [void](Invoke-Cdp $ws 'Emulation.setDeviceMetricsOverride' @{ width = $Width; height = $Height; deviceScaleFactor = 1; mobile = $false })
  [void](Invoke-Cdp $ws 'Page.enable' @{})
  $pre = "try{localStorage.setItem('breedingpro:lang','$Lang');localStorage.setItem('breedingpro:theme','light');}catch(e){}"
  [void](Invoke-Cdp $ws 'Page.addScriptToEvaluateOnNewDocument' @{ source = $pre })
  [void](Invoke-Cdp $ws 'Page.navigate' @{ url = $url })
  Start-Sleep -Milliseconds $Wait
  $code = [IO.File]::ReadAllText($ScriptFile, [Text.Encoding]::UTF8)
  $res = Invoke-Cdp $ws 'Runtime.evaluate' @{ expression = $code; awaitPromise = $true; returnByValue = $true }
  $v = $res.obj.result.result.value
  $json = if ($v -is [string]) { $v } else { $v | ConvertTo-Json -Depth 10 }
  if ($res.obj.result.exceptionDetails) { $json = 'ERROR: ' + ($res.obj.result.exceptionDetails | ConvertTo-Json -Depth 6) }
  if ($Out) { [IO.File]::WriteAllText($Out, $json, (New-Object Text.UTF8Encoding $false)) } else { $json }
} finally {
  try { $proc | Stop-Process -Force } catch {}; Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" | Where-Object { $_.CommandLine -like ('*' + $profileDir + '*') } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
}
