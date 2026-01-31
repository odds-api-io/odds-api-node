/**
 * Basic usage example - TypeScript
 */

import { OddsAPIClient } from 'odds-api-io';

async function main() {
  // Initialize the client with your API key
  const client = new OddsAPIClient({
    apiKey: process.env.ODDS_API_KEY || 'your-api-key-here',
  });

  try {
    // Get all available sports
    console.log('Fetching sports...');
    const sports = await client.getSports();
    console.log(`Found ${sports.length} sports:`, sports.map(s => s.name));

    // Get NBA leagues
    console.log('\nFetching basketball leagues...');
    const leagues = await client.getLeagues('basketball');
    console.log('Leagues:', leagues.map(l => l.name));

    // Get upcoming NBA events
    console.log('\nFetching NBA events...');
    const events = await client.getEvents({
      sport: 'basketball',
      league: 'usa-nba',
    });
    console.log(`Found ${events.length} NBA events`);

    if (events.length > 0) {
      const event = events[0];
      console.log('\nFirst event:', {
        id: event.id,
        teams: `${event.homeParticipant.name} vs ${event.awayParticipant.name}`,
        startTime: event.startTime,
      });

      // Get odds for this event
      console.log('\nFetching odds for the event...');
      const odds = await client.getEventOdds({
        eventId: event.id,
        bookmakers: 'pinnacle,bet365',
      });
      console.log('Odds markets:', odds.markets.map(m => m.market));
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
