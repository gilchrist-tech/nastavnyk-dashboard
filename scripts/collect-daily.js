import { runGa4Collector } from './collect-ga4.js';
import { runInstagramCollector } from './collect-instagram.js';
import { runTikTokCollector } from './collect-tiktok.js';

async function main() {
  await runGa4Collector(process.argv.slice(2));
  await runInstagramCollector(process.argv.slice(2));
  await runTikTokCollector(process.argv.slice(2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
