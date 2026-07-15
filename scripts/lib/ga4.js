import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { getWarsawTimestamp } from './dates.js';

const TRAFFIC_DIMENSIONS = [
  { name: 'sessionSourceMedium' },
  { name: 'sessionCampaignName' },
  { name: 'landingPagePlusQueryString' }
];

const TRAFFIC_METRICS = [
  { name: 'sessions' },
  { name: 'totalUsers' },
  { name: 'newUsers' },
  { name: 'engagedSessions' },
  { name: 'engagementRate' },
  { name: 'keyEvents' },
  { name: 'totalRevenue' }
];

function createGa4Client(credentialsPath) {
  return new BetaAnalyticsDataClient({
    keyFilename: credentialsPath
  });
}

function metricValue(row, index) {
  return row.metricValues?.[index]?.value || '';
}

function dimensionValue(row, index) {
  return row.dimensionValues?.[index]?.value || '';
}

function rowKey(row) {
  return [dimensionValue(row, 0), dimensionValue(row, 1), dimensionValue(row, 2)].join('||');
}

async function getRegistrationsByTraffic({ client, propertyId, startDate, endDate, eventName }) {
  if (!eventName) return new Map();

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      ...TRAFFIC_DIMENSIONS,
      { name: 'eventName' }
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        stringFilter: {
          matchType: 'EXACT',
          value: eventName
        }
      }
    }
  });

  const registrations = new Map();
  for (const row of response.rows || []) {
    const key = [dimensionValue(row, 0), dimensionValue(row, 1), dimensionValue(row, 2)].join('||');
    registrations.set(key, metricValue(row, 0));
  }

  return registrations;
}

export async function collectGa4Traffic({
  credentialsPath,
  propertyId,
  startDate,
  endDate,
  registrationEventName
}) {
  const client = createGa4Client(credentialsPath);
  const updatedAt = getWarsawTimestamp();

  const [traffic] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: TRAFFIC_DIMENSIONS,
    metrics: TRAFFIC_METRICS,
    orderBys: [
      {
        metric: { metricName: 'sessions' },
        desc: true
      }
    ],
    limit: 250
  });

  const registrations = await getRegistrationsByTraffic({
    client,
    propertyId,
    startDate,
    endDate,
    eventName: registrationEventName
  });

  const trafficRows = (traffic.rows || []).map((row) => {
    const key = rowKey(row);
    return [
      endDate,
      dimensionValue(row, 0),
      dimensionValue(row, 1),
      dimensionValue(row, 2),
      metricValue(row, 0),
      metricValue(row, 1),
      metricValue(row, 2),
      metricValue(row, 3),
      metricValue(row, 4),
      metricValue(row, 5),
      registrations.get(key) || '',
      metricValue(row, 6),
      updatedAt,
      'сирі'
    ];
  });

  const totals = traffic.totals?.[0]?.metricValues || [];
  const dailyMetricRows = [
    [endDate, 'GA4', 'Сесії', totals[0]?.value || '', 'GA4 Data API', updatedAt, 'органічні', 'сирі'],
    [endDate, 'GA4', 'Користувачі', totals[1]?.value || '', 'GA4 Data API', updatedAt, 'органічні', 'сирі'],
    [endDate, 'GA4', 'Нові користувачі', totals[2]?.value || '', 'GA4 Data API', updatedAt, 'органічні', 'сирі'],
    [endDate, 'GA4', 'Залучені сесії', totals[3]?.value || '', 'GA4 Data API', updatedAt, 'органічні', 'сирі'],
    [endDate, 'GA4', 'Рівень залучення', totals[4]?.value || '', 'GA4 Data API', updatedAt, 'розраховані', 'сирі'],
    [endDate, 'GA4', 'Ключові події', totals[5]?.value || '', 'GA4 Data API', updatedAt, 'органічні', 'сирі'],
    [endDate, 'GA4', 'Дохід', totals[6]?.value || '', 'GA4 Data API', updatedAt, 'органічні', 'сирі']
  ];

  return {
    trafficRows,
    dailyMetricRows,
    rowCount: trafficRows.length
  };
}
