/**
 * Golf outright prices and results, then grading a bet slip.
 *
 * Outrights are a paid add-on; a key without it gets ForbiddenError.
 *
 * Usage:
 *   ODDS_API_KEY=... npx tsx examples/golf-outrights-and-settlement.ts
 */

import { OddsAPIClient, ForbiddenError, isPriceRunner } from 'odds-api-io';

const client = new OddsAPIClient({ apiKey: process.env.ODDS_API_KEY || 'your-api-key-here' });

async function outrights() {
  const tournaments = await client.getOutrights({ sport: 'golf', league: 'pga-tour' });
  const next = tournaments.find((t) => t.bookmakerCount > 0);
  if (!next) return console.log('No priced tournament right now');

  const odds = await client.getOutrightOdds({ id: next.id, bookmakers: ['DraftKings', 'Betfair Exchange'] });
  console.log(`${odds.name} (${odds.date})`);
  for (const [bookmaker, markets] of Object.entries(odds.bookmakers)) {
    for (const market of markets) {
      const top = market.odds.slice(0, 3).map((r) => {
        if (isPriceRunner(r)) return `${r.label} ${r.odds}${r.layOdds ? `/${r.layOdds}` : ''}`;
        return `${r.label} yes ${r.yes ?? '-'} no ${r.no ?? '-'}`;
      });
      console.log(`  ${bookmaker} ${market.name}: ${top.join(', ')}`);
    }
  }

  const settled = await client.getOutrights({ sport: 'golf', status: 'settled' });
  if (settled.length) {
    const results = await client.getOutrightResults(settled[settled.length - 1].id);
    console.log(`${results.name} winners:`, results.winners['Winner']);
  }
}

async function grading() {
  const { grades } = await client.gradeBets([
    { ref: 'bet-1', eventId: 74919888, market: 'ML', side: 'home' },
    { ref: 'bet-2', eventId: 74919888, market: 'Totals', hdp: 2.5, side: 'over' },
  ]);
  for (const g of grades) console.log(`${g.ref}: ${g.result}${g.reason ? ` (${g.reason})` : ''}${g.final ? '' : ', check again later'}`);
}

async function main() {
  try {
    await outrights();
  } catch (err) {
    if (err instanceof ForbiddenError) console.log(err.message);
    else throw err;
  }
  await grading();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
