/**
 * Arbitrage betting example - Find risk-free betting opportunities
 */

import { OddsAPIClient } from 'odds-api-io';

async function main() {
  const client = new OddsAPIClient({
    apiKey: process.env.ODDS_API_KEY || 'your-api-key-here',
  });

  try {
    console.log('Fetching arbitrage opportunities...');
    
    const arbs = await client.getArbitrageBets({
      bookmakers: 'pinnacle,bet365',
      limit: 10,
      includeEventDetails: true,
    });

    console.log(`Found ${arbs.length} arbitrage opportunities\n`);

    arbs.forEach((arb, index) => {
      console.log(`\n=== Arbitrage #${index + 1} ===`);
      console.log(`Profit: ${arb.profitPercentage.toFixed(2)}%`);
      console.log(`Market: ${arb.market}`);
      
      if (arb.event) {
        console.log(`Event: ${arb.event.homeParticipant.name} vs ${arb.event.awayParticipant.name}`);
        console.log(`Start: ${arb.event.startTime}`);
      }

      console.log('Legs:');
      arb.legs.forEach((leg) => {
        console.log(`  - ${leg.outcome} @ ${leg.odds} (${leg.bookmaker})`);
        if (leg.stake) {
          console.log(`    Stake: $${leg.stake.toFixed(2)}`);
        }
      });
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
