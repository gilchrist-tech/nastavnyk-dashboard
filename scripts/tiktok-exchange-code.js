import { execFileSync } from 'node:child_process';
import { getConfig } from './lib/config.js';
import { updateEnvFile } from './lib/env-file.js';
import { exchangeTikTokCode } from './lib/tiktok.js';

function argValue(name) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function tokenExpiryIso(secondsFromNow) {
  if (!secondsFromNow) return '';
  return new Date(Date.now() + Number(secondsFromNow) * 1000).toISOString();
}

const config = getConfig();
const useClipboard = process.argv.includes('--code-from-clipboard');
const code = argValue('--code') || process.env.TIKTOK_AUTH_CODE || (useClipboard
  ? execFileSync('pbpaste', { encoding: 'utf8' }).trim()
  : '');

if (!config.tiktokClientKey || !config.tiktokClientSecret || !config.tiktokRedirectUri) {
  console.error('Fill TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TIKTOK_REDIRECT_URI in .env.local first.');
  process.exit(1);
}

if (!code) {
  console.error('Pass --code=... or --code-from-clipboard after copying the TikTok authorization code.');
  process.exit(1);
}

const token = await exchangeTikTokCode({
  clientKey: config.tiktokClientKey,
  clientSecret: config.tiktokClientSecret,
  redirectUri: config.tiktokRedirectUri,
  code
});

updateEnvFile('.env.local', {
  TIKTOK_ACCESS_TOKEN: token.access_token,
  TIKTOK_REFRESH_TOKEN: token.refresh_token,
  TIKTOK_OPEN_ID: token.open_id,
  TIKTOK_TOKEN_EXPIRES_AT: tokenExpiryIso(token.expires_in),
  TIKTOK_REFRESH_EXPIRES_AT: tokenExpiryIso(token.refresh_expires_in)
});

console.log('TikTok tokens saved to .env.local.');
console.log(`open_id=${token.open_id || 'n/a'}`);
console.log(`scope=${token.scope || 'n/a'}`);
console.log(`access_token_expires_at=${tokenExpiryIso(token.expires_in) || 'n/a'}`);
console.log(`refresh_token_expires_at=${tokenExpiryIso(token.refresh_expires_in) || 'n/a'}`);
