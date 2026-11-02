# One approved diagnostic request; no provider response body or credentials are printed.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$apiKey = $env:RAJAONGKIR_SHIPPING_COST_API_KEY
if ([string]::IsNullOrWhiteSpace($apiKey)) {
  $secure = Read-Host 'RajaOngkir Shipping Cost API key' -AsSecureString
  $apiKey = ([pscredential]::new('rajaongkir', $secure)).GetNetworkCredential().Password
}
if ([string]::IsNullOrWhiteSpace($apiKey)) { throw 'API key belum tersedia.' }
$base = $env:RAJAONGKIR_SHIPPING_COST_BASE_URL
if ([string]::IsNullOrWhiteSpace($base)) { throw 'Atur RAJAONGKIR_SHIPPING_COST_BASE_URL pada sesi PowerShell sesuai konfigurasi Production.' }
$uri = $null
if (-not [Uri]::TryCreate($base, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or -not $uri.Host.EndsWith('.komerce.id') -or $uri.AbsolutePath.TrimEnd('/') -ne '/api/v1' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'Base URL tidak valid; gunakan base endpoint /api/v1.' }
$destination = Read-Host 'Destination ID RajaOngkir alamat yang gagal'
$weight = Read-Host 'Berat request dalam gram'
$destinationNumber = [long]0; $weightNumber = [long]0
if ($destination -notmatch '^[1-9][0-9]*$' -or $weight -notmatch '^[1-9][0-9]*$' -or -not [long]::TryParse($destination, [ref]$destinationNumber) -or -not [long]::TryParse($weight, [ref]$weightNumber) -or $destinationNumber -gt 9007199254740991 -or $weightNumber -gt 9007199254740991) { throw 'Destination ID dan berat harus bilangan bulat positif yang valid.' }
$status = $null
function Show-ProviderCategory([int]$code) {
  if ($code -eq 429) { return 'Provider membatasi permintaan atau kuota.' }
  if ($code -in 401,403) { return 'Otorisasi provider ditolak.' }
  if ($code -in 400,422) { return 'Parameter atau permintaan ditolak provider.' }
  if ($code -eq 404) { return 'Endpoint atau resource provider tidak ditemukan.' }
  if ($code -ge 500) { return 'Kesalahan layanan provider.' }
  if ($code -ge 300) { return 'Respons provider tidak berhasil.' }
  return 'Respons HTTP berhasil; periksa kategori data.'
}
try {
  $result = Invoke-WebRequest -UseBasicParsing -Method Post -Uri ($base.TrimEnd('/') + '/calculate/domestic-cost') -Headers @{key=$apiKey} -ContentType 'application/x-www-form-urlencoded' -Body @{origin='73357'; destination=$destination; weight=$weight; courier='jnt'} -TimeoutSec 15 -MaximumRedirection 0
  $status = [int]$result.StatusCode
  Write-Output "Provider HTTP: $status"
  Write-Output (Show-ProviderCategory $status)
  try {
    $body = $result.Content | ConvertFrom-Json
    $code = [string]$body.meta.code
    if ($code -match '^\d{3}$' -and [int]$code -ge 400) { Write-Output 'Metadata provider menunjukkan kegagalan.' }
    elseif ($null -eq $body.data -or @($body.data).Count -eq 0) { Write-Output 'Tidak ada layanan dalam respons provider.' }
    else { Write-Output 'Provider mengembalikan data layanan.' }
  } catch { Write-Output 'Respons JSON tidak dapat dipastikan.' }
} catch {
  if ($_.Exception.Response) { try { $status = [int]$_.Exception.Response.StatusCode } catch {} }
  if ($null -ne $status) { Write-Output "Provider HTTP: $status"; Write-Output (Show-ProviderCategory $status) } else { Write-Output 'Tidak ada status HTTP: periksa koneksi atau timeout.' }
} finally {
  $apiKey = $null; $secure = $null
}
