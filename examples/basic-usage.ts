/**
 * Basic usage example - TypeScript
 */

import { OddsAPIClient } from 'odds-api-io';

async function main() {
  const client = new OddsAPIClient({
    apiKey: process.env.ODDS_API_KEY || 'your-api-key-here',
  });

  try {
    // Get all available sports
    console.log('Fetching sports...');
    const sports = await client.getSports();
    console.log(`Found ${sports.length} sports`);
    sports.slice(0, 5).forEach(s => console.log(`  - ${s.name} (${s.slug})`));

    // Get basketball leagues
    console.log('\nFetching basketball leagues...');
    const leagues = await client.getLeagues('basketball');
    console.log(`Found ${leagues.length} basketball leagues`);
    leagues.slice(0, 5).forEach(l => console.log(`  - ${l.name} (${l.slug})`));

    // Get upcoming NBA events
    console.log('\nFetching NBA events...');
    const events = await client.getEvents({
      sport: 'basketball',
      league: 'usa-nba',
    });
    console.log(`Found ${events.length} NBA events`);

    if (events.length > 0) {
      const event = events[0];
      console.log(`\nFirst event: ${event.home} vs ${event.away}`);
      console.log(`  ID: ${event.id} | Date: ${event.date} | Status: ${event.status}`);

      // Get odds for this event
      console.log('\nFetching odds...');
      const odds = await client.getEventOdds({
        eventId: event.id,
        bookmakers: 'Bet365',
      });

      const bookmakers = odds.bookmakers || {};
      for (const [bookie, markets] of Object.entries(bookmakers)) {
        console.log(`\n  ${bookie}:`);
        (markets as any[]).slice(0, 3).forEach((market: any) => {
          console.log(`    ${market.name}: ${JSON.stringify(market.odds[0])}`);
        });
      }
    }

    // Search for Lakers games
    console.log('\nSearching for Lakers games...');
    const lakersGames = await client.searchEvents('Lakers');
    console.log(`Found ${lakersGames.length} Lakers games`);

    // Get live events
    console.log('\nFetching live basketball events...');
    const liveEvents = await client.getLiveEvents('basketball');
    console.log(`Found ${liveEvents.length} live events`);

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
