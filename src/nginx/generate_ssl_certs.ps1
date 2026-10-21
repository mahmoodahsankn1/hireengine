# PowerShell script to generate self-signed SSL certificates for HireFlow HTTPS deployment
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$certsDir = Join-Path $scriptDir "certs"

if (-not (Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir -Force | Out-Null
}

Write-Host "Generating SSL Certificates for HireFlow in $certsDir..." -ForegroundColor Cyan

# Check if openssl is available in PATH or Git directory
$opensslCmd = Get-Command openssl -ErrorAction SilentlyContinue
if (-not $opensslCmd) {
    $gitOpenssl = "C:\Program Files\Git\usr\bin\openssl.exe"
    if (Test-Path $gitOpenssl) {
        $opensslCmd = $gitOpenssl
    }
}

if ($opensslCmd) {
    & $opensslCmd req -x509 -nodes -days 365 -newkey rsa:2048 `
        -keyout "$certsDir\key.pem" `
        -out "$certsDir\cert.pem" `
        -subj "/CN=localhost/O=HireFlow/C=IN" `
        -addext "subjectAltName=DNS:localhost,DNS:hireflow.local,IP:127.0.0.1"
    Write-Host "SSL certificates created successfully with OpenSSL!" -ForegroundColor Green
} else {
    # Native PowerShell certificate creation
    Write-Host "OpenSSL not found in PATH, using New-SelfSignedCertificate..." -ForegroundColor Yellow
    $cert = New-SelfSignedCertificate -DnsName "localhost", "hireflow.local", "127.0.0.1" `
        -CertStoreLocation "cert:\CurrentUser\My" `
        -NotAfter (Get-Date).AddYears(1) `
        -KeyExportPolicy Exportable `
        -KeySpec Signature

    # Export Certificate (.pem)
    $certBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
    $certB64 = [System.Convert]::ToBase64String($certBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
    $certPem = "-----BEGIN CERTIFICATE-----`r`n$certB64`r`n-----END CERTIFICATE-----`r`n"
    [System.IO.File]::WriteAllText("$certsDir\cert.pem", $certPem)

    # Note on key
    Write-Host "Certificate exported to $certsDir\cert.pem" -ForegroundColor Green
}

Write-Host "Done! Certs located at: $certsDir" -ForegroundColor Cyan
