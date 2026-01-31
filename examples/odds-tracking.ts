/**
 * Odds tracking example - Monitor odds movements
 */

import { OddsAPIClient } from 'odds-api-io';

async function main() {
  const client = new OddsAPIClient({
    apiKey: process.env.ODDS_API_KEY || 'your-api-key-here',
  });

  try {
    // Get upcoming NBA events
    const events = await client.getEvents({
      sport: 'basketball',
      league: 'usa-nba',
    });

    if (events.length === 0) {
      console.log('No events found');
      return;
    }

    const event = events[0];
    console.log(`Tracking odds for: ${event.homeParticipant.name} vs ${event.awayParticipant.name}`);
    console.log(`Event ID: ${event.id}\n`);

    // Get current odds
    console.log('Current odds:');
    const odds = await client.getEventOdds({
      eventId: event.id,
      bookmakers: 'pinnacle,bet365',
    });

    odds.markets.forEach((market) => {
      console.log(`\n${market.market}:`);
      market.outcomes.forEach((outcome) => {
        console.log(`  ${outcome.name}: ${outcome.odds} @ ${outcome.bookmaker}`);
      });
    });

    // Get odds movement history
    console.log('\n\nOdds movement for moneyline (Pinnacle):');
    try {
      const movements = await client.getOddsMovement({
        eventId: event.id,
        bookmaker: 'pinnacle',
        market: 'moneyline',
      });

      console.log(`Found ${movements.movements.length} historical odds points`);
      
      // Show last 5 movements
      const recent = movements.movements.slice(-5);
      recent.forEach((movement) => {
        const date = new Date(movement.timestamp);
        console.log(`  ${date.toISOString()}: ${movement.odds}`);
      });
    } catch (error) {
      console.log('No movement data available');
    }

    // Get updated odds since 1 hour ago
    console.log('\n\nChecking for recent odds updates...');
    const oneHourAgo = Date.now() - 3600000;
    const updatedOdds = await client.getUpdatedOddsSince({
      since: oneHourAgo,
      bookmaker: 'pinnacle',
      sport: 'basketball',
    });

    console.log(`${updatedOdds.length} events have updated odds in the last hour`);

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
