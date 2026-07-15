import { google } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/analytics.readonly'
];

export function createGoogleAuth(credentialsPath) {
  return new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: SCOPES
  });
}
