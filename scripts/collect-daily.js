import { runGa4Collector } from './collect-ga4.js';

async function main() {
  await runGa4Collector(process.argv.slice(2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
