$ErrorActionPreference='SilentlyContinue'
$PairId='vs-7f3c9a5e2d8146b8a1f0c4e9'
$PairSecret='mtr-8e2a1f7c5d9340b6a4c9e1f7d2b8c6a1'
$Registry='https://viral-studio-render-server.onrender.com'
$Base=Split-Path -Parent $MyInvocation.MyCommand.Path
$Cloudflared=Join-Path $Base 'cloudflared.exe'
$UrlFile=Join-Path $Base 'URL-MOTOR-PC.txt'
$OutLog=Join-Path $Base 'tunnel-out.log'
$ErrLog=Join-Path $Base 'tunnel-err.log'
function Register-Motor([string]$url){
  try {
    $body=@{pairId=$PairId;secret=$PairSecret;url=$url;pcName=$env:COMPUTERNAME;version='3.1'} | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri ($Registry+'/motor/register') -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 25 | Out-Null
    return $true
  } catch { return $false }
}
while($true){
  Remove-Item $OutLog,$ErrLog -Force -ErrorAction SilentlyContinue
  Write-Host ''
  Write-Host '===================================================' -ForegroundColor Cyan
  Write-Host ' VIRAL STUDIO MOTOR PC - CONEXAO AUTOMATICA' -ForegroundColor Cyan
  Write-Host ' Criando conexao segura... nao precisa copiar URL.' -ForegroundColor Gray
  Write-Host '===================================================' -ForegroundColor Cyan
  $p=Start-Process -FilePath $Cloudflared -ArgumentList @('tunnel','--url','http://localhost:10000','--no-autoupdate') -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog -PassThru -WindowStyle Hidden
  $url=$null
  for($i=0;$i -lt 90 -and -not $p.HasExited -and -not $url;$i++){
    Start-Sleep -Milliseconds 700
    $txt=((Get-Content $OutLog -Raw -ErrorAction SilentlyContinue)+' '+(Get-Content $ErrLog -Raw -ErrorAction SilentlyContinue))
    $m=[regex]::Match($txt,'https://[a-z0-9-]+\.trycloudflare\.com','IgnoreCase')
    if($m.Success){$url=$m.Value}
  }
  if(-not $url){
    Write-Host 'Nao consegui criar o tunel. Tentando novamente em 5 segundos...' -ForegroundColor Yellow
    try{Stop-Process -Id $p.Id -Force}catch{}
    Start-Sleep 5; continue
  }
  Set-Content -Path $UrlFile -Value $url -Encoding UTF8
  try{Set-Clipboard -Value $url}catch{}
  Write-Host ''
  Write-Host ' MOTOR PC ONLINE' -ForegroundColor Green
  Write-Host (' URL atual: '+$url) -ForegroundColor White
  Write-Host ' O Viral Studio do celular vai encontrar este PC sozinho.' -ForegroundColor Green
  Write-Host ' Pode deixar esta janela aberta/minimizada.' -ForegroundColor Gray
  Write-Host ''
  while(-not $p.HasExited){
    if(Register-Motor $url){Write-Host ('['+(Get-Date -Format 'HH:mm:ss')+'] Celular pode conectar automaticamente.') -ForegroundColor DarkGreen}
    else{Write-Host ('['+(Get-Date -Format 'HH:mm:ss')+'] Servidor de pareamento acordando/reconectando...') -ForegroundColor DarkYellow}
    Start-Sleep 20
  }
  Write-Host 'Tunel caiu. Recriando automaticamente...' -ForegroundColor Yellow
  Start-Sleep 3
}
