/**
 * Basic usage example - JavaScript (CommonJS)
 */

const { OddsAPIClient } = require('odds-api-io');

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
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
