/**
 * Arbitrage betting example - Find risk-free betting opportunities
 */

import { OddsAPIClient } from 'odds-api-io';

async function main() {
  const client = new OddsAPIClient({
    apiKey: process.env.ODDS_API_KEY || 'your-api-key-here',
  });

  try {
    console.log('Fetching arbitrage opportunities...\n');

    const arbs = await client.getArbitrageBets({
      bookmakers: 'Bet365,SingBet',
      limit: 10,
      includeEventDetails: true,
    });

    console.log(`Found ${arbs.length} arbitrage opportunities\n`);

    arbs.forEach((arb: any, index: number) => {
      const market = arb.market || {};
      const legs = arb.legs || [];
      const stakes = arb.optimalStakes || [];

      console.log(`=== Arbitrage #${index + 1} ===`);
      console.log(`Profit: ${(arb.profitMargin || 0).toFixed(2)}%`);
      console.log(`Event ID: ${arb.eventId}`);
      console.log(`Market: ${market.name || '?'}${market.hdp ? ` (${market.hdp})` : ''}`);

      console.log('Legs:');
      legs.forEach((leg: any) => {
        console.log(`  - ${leg.bookmaker} | ${leg.side} @ ${leg.odds}`);
      });

      if (stakes.length > 0) {
        console.log('Optimal stakes ($1000):');
        stakes.forEach((s: any) => {
          console.log(`  - ${s.bookmaker} | ${s.side} | $${s.stake?.toFixed(2)} -> $${s.potentialReturn?.toFixed(2)}`);
        });
      }
      console.log();
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
