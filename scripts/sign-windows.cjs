#!/usr/bin/env node

/**
 * Windows Authenticode Code Signing Script for Nova Tables
 *
 * This script is called by Tauri bundler during Windows packaging via bundle.windows.signCommand.
 * It signs executables and installers (%1) using Authenticode with SHA-256 and RFC 3161 timestamping.
 *
 * Supported environments:
 * - Linux / macOS cross-compilation (uses osslsigncode)
 * - Native Windows (uses signtool.exe or osslsigncode)
 *
 * Configuration via environment variables:
 * - WINDOWS_CERTIFICATE_FILE (or CERTIFICATE_PATH, PFX_PATH): Path to .pfx/.p12 Authenticode certificate
 * - WINDOWS_CERTIFICATE_PASSWORD (or CERTIFICATE_PASSWORD, PFX_PASSWORD): Certificate password
 * - WINDOWS_CERTIFICATE_THUMBPRINT (optional): Certificate SHA-1 thumbprint for Windows Cert Store
 * - WINDOWS_TIMESTAMP_URL (optional): Timestamp server URL (default: http://timestamp.digicert.com)
 * - WINDOWS_DIGEST_ALGO (optional): Digest algorithm (default: sha256)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const targetFile = process.argv[2];

if (!targetFile) {
  console.error('[sign-windows] Error: No target file specified.');
  process.exit(1);
}

const resolvedTarget = path.resolve(targetFile);
if (!fs.existsSync(resolvedTarget)) {
  console.error(`[sign-windows] Error: Target file does not exist: ${resolvedTarget}`);
  process.exit(1);
}

const certFile = process.env.WINDOWS_CERTIFICATE_FILE || process.env.CERTIFICATE_PATH || process.env.PFX_PATH;
const certPassword = process.env.WINDOWS_CERTIFICATE_PASSWORD || process.env.CERTIFICATE_PASSWORD || process.env.PFX_PASSWORD || '';
const certThumbprint = process.env.WINDOWS_CERTIFICATE_THUMBPRINT;
const timestampUrl = process.env.WINDOWS_TIMESTAMP_URL || 'http://timestamp.digicert.com';
const digestAlgo = process.env.WINDOWS_DIGEST_ALGO || 'sha256';

function isCommandAvailable(cmd) {
  try {
    const res = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
    return res.status === 0;
  } catch {
    return false;
  }
}

if (!certFile && !certThumbprint) {
  console.log(`[sign-windows] Notice: No Authenticode certificate configured. Skipping signing for: ${path.basename(resolvedTarget)}`);
  console.log('[sign-windows] Set WINDOWS_CERTIFICATE_FILE and WINDOWS_CERTIFICATE_PASSWORD to enable code signing.');
  process.exit(0);
}

console.log(`[sign-windows] Signing ${path.basename(resolvedTarget)} with Authenticode (${digestAlgo})...`);

if (process.platform === 'win32') {
  if (isCommandAvailable('signtool.exe') || isCommandAvailable('signtool')) {
    const signtool = isCommandAvailable('signtool.exe') ? 'signtool.exe' : 'signtool';
    const args = ['sign'];
    if (certFile) {
      args.push('/f', path.resolve(certFile));
      if (certPassword) args.push('/p', certPassword);
    } else if (certThumbprint) {
      args.push('/sha1', certThumbprint);
    }
    args.push('/fd', digestAlgo, '/tr', timestampUrl, '/td', digestAlgo, resolvedTarget);
    try {
      execFileSync(signtool, args, { stdio: 'inherit' });
      console.log(`[sign-windows] Successfully signed ${path.basename(resolvedTarget)} with signtool.`);
      process.exit(0);
    } catch (err) {
      console.error(`[sign-windows] Failed to sign with signtool:`, err.message);
      process.exit(1);
    }
  }
}

// Cross-compilation or Windows with osslsigncode
if (isCommandAvailable('osslsigncode')) {
  if (!certFile) {
    console.error('[sign-windows] osslsigncode requires a PFX certificate file (WINDOWS_CERTIFICATE_FILE).');
    process.exit(1);
  }
  const tempOut = `${resolvedTarget}.signed`;
  const args = [
    'sign',
    '-pkcs12', path.resolve(certFile),
    '-n', 'Nova Tables',
    '-h', digestAlgo,
    '-ts', timestampUrl,
    '-in', resolvedTarget,
    '-out', tempOut,
  ];
  if (certPassword) {
    args.push('-pass', certPassword);
  }
  try {
    execFileSync('osslsigncode', args, { stdio: 'inherit' });
    fs.renameSync(tempOut, resolvedTarget);
    console.log(`[sign-windows] Successfully signed ${path.basename(resolvedTarget)} with osslsigncode.`);
    process.exit(0);
  } catch (err) {
    if (fs.existsSync(tempOut)) {
      try { fs.unlinkSync(tempOut); } catch {}
    }
    console.error(`[sign-windows] Failed to sign with osslsigncode:`, err.message);
    process.exit(1);
  }
}

console.warn(`[sign-windows] Warning: Signing tool (signtool.exe or osslsigncode) not found in PATH.`);
console.warn(`[sign-windows] Install osslsigncode to sign during Linux cross-compilation.`);
process.exit(0);
