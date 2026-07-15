export function getWarsawTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function nextIsoDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return toIsoDate(date);
}

export function getCompletedDateRange(lookbackDays = 1) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - Math.max(lookbackDays - 1, 0));

  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end)
  };
}

export function parseCliArgs(argv) {
  const args = {
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    const [key, value] = arg.split('=');
    if (key === '--start-date') args.startDate = value;
    if (key === '--end-date') args.endDate = value;
  }

  return args;
}
