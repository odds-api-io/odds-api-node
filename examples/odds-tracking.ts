/**
 * Odds tracking example - Monitor odds movements
 */

import { OddsAPIClient } from 'odds-api-io';

async function main() {
  const client = new OddsAPIClient({
    apiKey: process.env.ODDS_API_KEY || 'your-api-key-here',
  });

  try {
    // Get NBA events
    const events = await client.getEvents({
      sport: 'basketball',
      league: 'usa-nba',
    });

    if (events.length === 0) {
      console.log('No events found');
      return;
    }

    const event = events[0];
    console.log(`Tracking odds for: ${event.home} vs ${event.away}`);
    console.log(`Event ID: ${event.id} | Status: ${event.status}\n`);

    // Get current odds from multiple bookmakers
    console.log('Current odds:');
    const odds = await client.getEventOdds({
      eventId: event.id,
      bookmakers: 'Bet365,SingBet',
    });

    const bookmakers = odds.bookmakers || {};
    for (const [bookie, markets] of Object.entries(bookmakers)) {
      console.log(`\n  ${bookie}:`);
      (markets as any[]).forEach((market: any) => {
        const firstOdds = market.odds[0];
        if (market.name === 'ML') {
          console.log(`    ${market.name}: Home ${firstOdds.home} | Away ${firstOdds.away}`);
        } else if (market.name === 'Totals') {
          console.log(`    ${market.name} (${firstOdds.hdp}): Over ${firstOdds.over} | Under ${firstOdds.under}`);
        } else if (market.name === 'Spread') {
          console.log(`    ${market.name} (${firstOdds.hdp}): Home ${firstOdds.home} | Away ${firstOdds.away}`);
        } else {
          console.log(`    ${market.name}: ${JSON.stringify(firstOdds)}`);
        }
      });
    }

    // Get odds movement history
    console.log('\n\nOdds movement (Bet365, ML):');
    try {
      const movements = await client.getOddsMovement({
        eventId: event.id,
        bookmaker: 'Bet365',
        market: 'ML',
      });

      if (Array.isArray(movements) && movements.length > 0) {
        const recent = movements.slice(-5);
        recent.forEach((m: any) => {
          console.log(`  ${m.updatedAt}: Home ${m.odds?.home} | Away ${m.odds?.away}`);
        });
      } else {
        console.log('  No movement data available');
      }
    } catch {
      console.log('  No movement data available');
    }

    // Get recently updated odds
    console.log('\nChecking for recent odds updates...');
    try {
      const oneHourAgo = Date.now() - 3600000;
      const updatedOdds = await client.getUpdatedOddsSince({
        since: oneHourAgo,
        bookmaker: 'Bet365',
        sport: 'basketball',
      });

      if (Array.isArray(updatedOdds)) {
        console.log(`${updatedOdds.length} events have updated odds in the last hour`);
      }
    } catch {
      console.log('Could not fetch recent updates');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
