/**
 * Premier League Odds Example
 * 
 * This example demonstrates how to fetch odds for all upcoming
 * Premier League matches from multiple bookmakers.
 */

import { OddsAPIClient } from '../src';

async function main() {
  // Initialize client with your API key
  const client = new OddsAPIClient({
    apiKey: 'YOUR_API_KEY'
  });

  try {
    console.log('Fetching Premier League events...\n');

    // Get all upcoming Premier League events
    const events = await client.getEvents({
      sport: 'football',
      league: 'england-premier-league'
    });

    if (!events || events.length === 0) {
      console.log('No upcoming Premier League events found.');
      return;
    }

    // Filter for pending events only
    const pendingEvents = events.filter(e => e.status === 'pending');

    console.log(`Found ${pendingEvents.length} upcoming Premier League matches\n`);
    console.log('='.repeat(100));

    // Fetch odds for each event (limit to first 3 for demo)
    for (const event of pendingEvents.slice(0, 3)) {
      console.log(`\n${event.home} vs ${event.away}`);
      console.log(`Starts: ${event.date}`);
      console.log(`Status: ${event.status ?? 'N/A'}`);
      console.log('-'.repeat(100));

      // Get odds from multiple bookmakers
      // Note: Bookmaker names are case-sensitive!
      const oddsData = await client.getEventOdds({
        eventId: event.id,
        bookmakers: 'Bet365,SingBet,FanDuel'
      });

      if (!oddsData || !oddsData.bookmakers) {
        console.log('No odds available for this match');
        continue;
      }

      // Display odds in a table format
      console.log(`${'Bookmaker'.padEnd(15)} ${'Home'.padEnd(10)} ${'Draw'.padEnd(10)} ${'Away'.padEnd(10)}`);
      console.log('-'.repeat(100));

      for (const bookmaker of oddsData.bookmakers) {
        const bookieName = bookmaker.name;

        // Find the moneyline (ML) market
        const mlMarket = bookmaker.markets?.find(market => market.name === 'ML');

        if (mlMarket && mlMarket.odds && mlMarket.odds.length > 0) {
          const odds = mlMarket.odds[0];
          const homeOdds = odds.home ?? 'N/A';
          const drawOdds = odds.draw ?? 'N/A';
          const awayOdds = odds.away ?? 'N/A';

          console.log(
            `${bookieName.padEnd(15)} ${String(homeOdds).padEnd(10)} ${String(drawOdds).padEnd(10)} ${String(awayOdds).padEnd(10)}`
          );
        } else {
          console.log(`${bookieName.padEnd(15)} No ML odds available`);
        }
      }

      console.log('='.repeat(100));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
