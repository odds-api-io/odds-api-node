const { test } = require('node:test');
const assert = require('node:assert/strict');

test('CommonJS entry exports the client and errors', () => {
  const sdk = require('odds-api-io');
  assert.equal(typeof sdk.OddsAPIClient, 'function');
  assert.equal(typeof sdk.OddsAPIError, 'function');
});

test('package.json is exported', () => {
  assert.equal(require('odds-api-io/package.json').name, 'odds-api-io');
});
