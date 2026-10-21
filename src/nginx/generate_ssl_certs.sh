#!/usr/bin/env bash
# Generate self-signed SSL certificates with Subject Alternative Names (SAN)
# for local HTTPS testing (enables mic/camera on Chrome, Safari, Firefox).
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
CERTS_DIR="$DIR/certs"
mkdir -p "$CERTS_DIR"

echo "🔐 Generating SSL Certificates for HireFlow in $CERTS_DIR ..."

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERTS_DIR/key.pem" \
  -out "$CERTS_DIR/cert.pem" \
  -subj "/CN=localhost/O=HireFlow/C=IN" \
  -addext "subjectAltName=DNS:localhost,DNS:hireflow.local,IP:127.0.0.1"

echo "✅ SSL certificate ($CERTS_DIR/cert.pem) and key ($CERTS_DIR/key.pem) created successfully!"
