import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const DEFAULT_GOOGLE_SHEETS_ID = '1PzikJ_rpFJx4SHOAroE0w9-X7eclEgA6IpmExSTEs_4';

export function getEnv(name, options = {}) {
  const value = process.env[name];
  if (!value && options.required) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || options.defaultValue || '';
}

export function getConfig() {
  return {
    googleCredentialsPath: getEnv('GOOGLE_APPLICATION_CREDENTIALS'),
    googleSheetsId: getEnv('GOOGLE_SHEETS_ID', {
      defaultValue: DEFAULT_GOOGLE_SHEETS_ID
    }),
    ga4PropertyId: getEnv('GA4_PROPERTY_ID'),
    ga4RegistrationEventName: getEnv('GA4_REGISTRATION_EVENT_NAME', {
      defaultValue: 'sign_up'
    }),
    ga4LookbackDays: Number(getEnv('GA4_LOOKBACK_DAYS', { defaultValue: '1' })),
    metaGraphVersion: getEnv('META_GRAPH_VERSION', { defaultValue: 'v25.0' }),
    metaInsightMetrics: getEnv('META_INSIGHT_METRICS', { defaultValue: 'reach' }),
    metaAccessToken: getEnv('META_ACCESS_TOKEN'),
    metaIgUserId: getEnv('META_IG_USER_ID'),
    metaPageId: getEnv('META_PAGE_ID')
  };
}

export function requireGoogleConfig() {
  return {
    googleCredentialsPath: getEnv('GOOGLE_APPLICATION_CREDENTIALS', { required: true }),
    googleSheetsId: getEnv('GOOGLE_SHEETS_ID', {
      defaultValue: DEFAULT_GOOGLE_SHEETS_ID
    })
  };
}

export function requireGa4Config() {
  return {
    ...requireGoogleConfig(),
    ga4PropertyId: getEnv('GA4_PROPERTY_ID', { required: true }),
    ga4RegistrationEventName: getEnv('GA4_REGISTRATION_EVENT_NAME', {
      defaultValue: 'sign_up'
    }),
    ga4LookbackDays: Number(getEnv('GA4_LOOKBACK_DAYS', { defaultValue: '1' }))
  };
}
