/**
 * Premier League Odds Example
 *
 * Fetch odds for all upcoming Premier League matches from multiple
 * bookmakers, including direct bet links.
 */

import { OddsAPIClient } from 'odds-api-io';

async function main() {
  const client = new OddsAPIClient({
    apiKey: process.env.ODDS_API_KEY || 'your-api-key-here',
  });

  try {
    console.log('Fetching Premier League events...\n');

    const events = await client.getEvents({
      sport: 'football',
      league: 'england-premier-league',
    });

    // Filter for pending/live events
    const activeEvents = events.filter(
      (e: any) => e.status === 'pending' || e.status === 'live'
    );

    console.log(`Found ${activeEvents.length} upcoming Premier League matches\n`);
    console.log('='.repeat(100));

    for (const event of activeEvents) {
      console.log(`\n${event.home} vs ${event.away}`);
      console.log(`Starts: ${event.date} | Status: ${event.status}`);
      console.log('-'.repeat(100));

      // Get odds from multiple bookmakers (names are case-sensitive!)
      const oddsData = await client.getEventOdds({
        eventId: event.id,
        bookmakers: 'Bet365,SingBet,FanDuel',
      });

      const bookmakers = (oddsData as any).bookmakers || {};
      if (Object.keys(bookmakers).length === 0) {
        console.log('No odds available for this match');
        console.log('='.repeat(100));
        continue;
      }

      // Display odds table
      console.log(
        'Bookmaker'.padEnd(15) +
        'Home'.padEnd(10) +
        'Draw'.padEnd(10) +
        'Away'.padEnd(10)
      );
      console.log('-'.repeat(100));

      for (const [bookie, markets] of Object.entries(bookmakers)) {
        // Find the ML (moneyline) market
        const mlMarket = (markets as any[]).find((m: any) => m.name === 'ML');
        if (mlMarket?.odds?.[0]) {
          const odds = mlMarket.odds[0];
          console.log(
            bookie.padEnd(15) +
            (odds.home || 'N/A').toString().padEnd(10) +
            (odds.draw || 'N/A').toString().padEnd(10) +
            (odds.away || 'N/A').toString().padEnd(10)
          );
        }
      }

      // Display direct bet links
      const urls = (oddsData as any).urls || {};
      const validUrls = Object.entries(urls).filter(([, url]) => url && url !== 'N/A');
      if (validUrls.length > 0) {
        console.log('\n  Direct bet links:');
        validUrls.forEach(([bookie, url]) => {
          console.log(`    ${bookie}: ${url}`);
        });
      }

      console.log('='.repeat(100));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
