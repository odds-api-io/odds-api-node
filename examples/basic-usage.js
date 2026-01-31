/**
 * Basic usage example - JavaScript (ESM)
 */

import { OddsAPIClient } from 'odds-api-io';

const client = new OddsAPIClient({
  apiKey: process.env.ODDS_API_KEY || 'your-api-key-here',
});

try {
  // Get all available sports
  console.log('Fetching sports...');
  const sports = await client.getSports();
  console.log(`Found ${sports.length} sports`);
  sports.slice(0, 5).forEach(s => console.log(`  - ${s.name} (${s.slug})`));

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
  }

  // Search for Lakers games
  console.log('\nSearching for Lakers games...');
  const lakersGames = await client.searchEvents('Lakers');
  console.log(`Found ${lakersGames.length} Lakers games`);

} catch (error) {
  console.error('Error:', error);
}
