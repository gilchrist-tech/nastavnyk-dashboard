import { getWarsawTimestamp, nextIsoDate } from './dates.js';

const ACCOUNT_METRIC_LABELS = {
  reach: 'Охоплення',
  views: 'Перегляди',
  follower_count: 'Нові підписники',
  profile_views: 'Перегляди профілю',
  website_clicks: 'Кліки на сайт',
  accounts_engaged: 'Залучені акаунти',
  total_interactions: 'Взаємодії'
};

const PROFILE_FIELD_LABELS = {
  followers_count: 'Підписники всього',
  media_count: 'Публікації всього'
};

const MEDIA_FORMAT_LABELS = {
  CAROUSEL_ALBUM: 'Carousel',
  IMAGE: 'Image',
  REELS: 'Reels',
  STORY: 'Story',
  VIDEO: 'Video'
};

class MetaApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MetaApiError';
    this.details = details;
  }
}

function parseCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function graphGet({ graphVersion, path, accessToken, params = {} }) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || response.statusText;
    throw new MetaApiError(`Meta API error ${response.status}: ${message}`, {
      status: response.status,
      path,
      params,
      error: data.error
    });
  }

  return data;
}

function warningFromError(context, error) {
  const message = error.details?.error?.message || error.message;
  return `${context}: ${message}`;
}

function metricValue(insight) {
  const totalValue = insight.total_value?.value;
  if (totalValue !== undefined && totalValue !== null) return totalValue;

  const values = insight.values || [];
  const value = values.at(-1)?.value;
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function getInsights({ graphVersion, accessToken, nodeId, metrics, params, warnings, context }) {
  if (!metrics.length) return {};

  try {
    const response = await graphGet({
      graphVersion,
      accessToken,
      path: `${nodeId}/insights`,
      params: {
        ...params,
        metric: metrics.join(',')
      }
    });

    return Object.fromEntries((response.data || []).map((insight) => [insight.name, metricValue(insight)]));
  } catch (error) {
    warnings.push(warningFromError(`${context} batch`, error));
  }

  const collected = {};
  for (const metric of metrics) {
    try {
      const response = await graphGet({
        graphVersion,
        accessToken,
        path: `${nodeId}/insights`,
        params: {
          ...params,
          metric
        }
      });
      const insight = response.data?.[0];
      if (insight) collected[insight.name] = metricValue(insight);
    } catch (error) {
      warnings.push(warningFromError(`${context} metric ${metric}`, error));
    }
  }

  return collected;
}

async function resolveInstagramUser({ graphVersion, accessToken, igUserId, pageId, warnings }) {
  if (igUserId) {
    const profile = await graphGet({
      graphVersion,
      accessToken,
      path: igUserId,
      params: {
        fields: 'id,username,name,followers_count,media_count'
      }
    });
    return { igUserId, profile };
  }

  if (pageId) {
    const page = await graphGet({
      graphVersion,
      accessToken,
      path: pageId,
      params: {
        fields: 'instagram_business_account{id,username,name,followers_count,media_count}'
      }
    });

    const profile = page.instagram_business_account;
    if (profile?.id) return { igUserId: profile.id, profile };
  }

  const pages = await graphGet({
    graphVersion,
    accessToken,
    path: 'me/accounts',
    params: {
      fields: 'id,name,instagram_business_account{id,username,name,followers_count,media_count}',
      limit: 100
    }
  });

  const pageWithInstagram = (pages.data || []).find((page) => page.instagram_business_account?.id);
  if (pageWithInstagram?.instagram_business_account?.id) {
    warnings.push(
      `META_IG_USER_ID не задано; використано Instagram акаунт зі сторінки "${pageWithInstagram.name}".`
    );
    return {
      igUserId: pageWithInstagram.instagram_business_account.id,
      profile: pageWithInstagram.instagram_business_account
    };
  }

  throw new Error('Could not resolve Instagram account. Fill META_IG_USER_ID or META_PAGE_ID.');
}

function isoDateFromTimestamp(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function mediaFormat(media) {
  return MEDIA_FORMAT_LABELS[media.media_product_type] || MEDIA_FORMAT_LABELS[media.media_type] || media.media_type || '';
}

function captionTopic(caption = '') {
  const hashtags = caption.match(/#[\p{L}\p{N}_]+/gu);
  if (hashtags?.length) return hashtags.slice(0, 4).join(' ');

  return caption
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 90) || '';
}

async function getMedia({ graphVersion, accessToken, igUserId, limit }) {
  const response = await graphGet({
    graphVersion,
    accessToken,
    path: `${igUserId}/media`,
    params: {
      fields: [
        'id',
        'caption',
        'comments_count',
        'like_count',
        'media_product_type',
        'media_type',
        'permalink',
        'timestamp'
      ].join(','),
      limit
    }
  });

  return response.data || [];
}

function inDateRange(media, startDate, endDateExclusive) {
  const mediaDate = isoDateFromTimestamp(media.timestamp);
  return mediaDate >= startDate && mediaDate < endDateExclusive;
}

export async function collectInstagram({
  graphVersion,
  accessToken,
  igUserId,
  pageId,
  accountInsightMetrics,
  mediaInsightMetrics,
  mediaLimit,
  startDate,
  endDate
}) {
  const warnings = [];
  const updatedAt = getWarsawTimestamp();
  const endDateExclusive = nextIsoDate(endDate);
  const accountMetrics = parseCsv(accountInsightMetrics);
  const mediaMetrics = parseCsv(mediaInsightMetrics);

  const instagram = await resolveInstagramUser({
    graphVersion,
    accessToken,
    igUserId,
    pageId,
    warnings
  });

  const profile = instagram.profile;
  const accountInsights = await getInsights({
    graphVersion,
    accessToken,
    nodeId: instagram.igUserId,
    metrics: accountMetrics,
    params: {
      period: 'day',
      since: startDate,
      until: endDateExclusive
    },
    warnings,
    context: 'Instagram account insights'
  });

  const dailyMetricRows = [
    ...Object.entries(PROFILE_FIELD_LABELS)
      .filter(([field]) => profile[field] !== undefined && profile[field] !== null)
      .map(([field, label]) => [
        endDate,
        'Instagram',
        label,
        profile[field],
        'Meta Graph API',
        updatedAt,
        'знімок',
        'сирі'
      ]),
    ...Object.entries(accountInsights).map(([metric, value]) => [
      endDate,
      'Instagram',
      ACCOUNT_METRIC_LABELS[metric] || metric,
      value,
      'Meta Graph API',
      updatedAt,
      'органічні',
      'сирі'
    ])
  ];

  const media = (await getMedia({
    graphVersion,
    accessToken,
    igUserId: instagram.igUserId,
    limit: mediaLimit
  })).filter((item) => inDateRange(item, startDate, endDateExclusive));

  const postRows = [];
  for (const item of media) {
    const insights = await getInsights({
      graphVersion,
      accessToken,
      nodeId: item.id,
      metrics: mediaMetrics,
      params: {},
      warnings,
      context: `Instagram media ${item.id}`
    });

    postRows.push([
      isoDateFromTimestamp(item.timestamp),
      'Instagram',
      item.permalink || '',
      mediaFormat(item),
      captionTopic(item.caption),
      insights.reach || '',
      insights.views || '',
      insights.likes || item.like_count || '',
      insights.comments || item.comments_count || '',
      insights.saved || '',
      insights.shares || '',
      '',
      '',
      `media_id=${item.id}; username=${profile.username || ''}`
    ]);
  }

  return {
    dailyMetricRows,
    postRows,
    warnings,
    profile,
    rowCount: dailyMetricRows.length + postRows.length,
    accountMetricCount: dailyMetricRows.length,
    postCount: postRows.length
  };
}
