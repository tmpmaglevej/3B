const assert = require('node:assert/strict');
const { once } = require('node:events');
const sql = require('mssql');
const database = require('./database');

async function startTestServer(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

// Hvert element er et forespørgselsresultat (rækker) eller en kontrolleret fejl.
// Hjælperen udfører ikke SQL og kan derfor ikke bevise låsesamspil på Azure.
function mockTransaction(t, results) {
  const events = [];
  const requests = [];
  const transaction = {
    async begin(level) {
      assert.equal(level, sql.ISOLATION_LEVEL.SERIALIZABLE);
      events.push('begin');
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    request() {
      const parameters = {};
      return {
        input(name, type, value) { parameters[name] = value; return this; },
        async query() {
          requests.push(parameters);
          events.push('query');
          assert.ok(requests.length <= results.length, 'Uventet ekstra databasekald');
          const result = results[requests.length - 1];
          if (result instanceof Error) throw result;
          return { recordset: result };
        },
      };
    },
  };
  t.mock.method(database, 'getPool', async () => ({ transaction: () => transaction }));
  t.after(() => assert.equal(requests.length, results.length, 'Alle forventede databasekald er udført'));
  return { events, requests };
}

module.exports = { startTestServer, mockTransaction };
