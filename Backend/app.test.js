const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./testing');
const database = require('./database');
const notifications = require('./notifications');
const app = require('./app');

test('Booking-API: adgang, fejl og begrænsning af gentagne opslag uden Azure', async (t) => {
  const lookup = t.mock.method(database, 'findBooking', async (reference, email) => {
    if (reference === 'DEMO-READY' && email === 'ready@example.com') {
      return { status: 'ready', roomNumber: '301', notificationStatus: 'accepted' };
    }
    if (reference === 'DEMO-WAITING' && email === 'waiting@example.com') {
      return { status: 'not_ready', roomNumber: '302' };
    }
    return null;
  });
  const origin = await startTestServer(t, app);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  t.beforeEach(() => {
    // Hver deltest får et nyt ratevindue og tæller kun sine egne databasekald.
    now += 60001;
    lookup.mock.resetCalls();
  });
  const post = (body, headers = {}) => fetch(`${origin}/api/bookings/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  await t.test('Health og statisk gæsteside kræver ikke database', async () => {
    const health = await fetch(`${origin}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.match(await (await fetch(origin)).text(), /booking-form/);
    assert.equal(lookup.mock.callCount(), 0);
  });

  await t.test('Begge tilladte statusværdier og normalisering', async () => {
    const ready = await post({ bookingReference: ' demo-ready ', email: ' ready@example.com ' });
    assert.equal(ready.status, 200);
    assert.equal(ready.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await ready.json(), { status: 'ready', roomNumber: '301', notificationStatus: 'accepted' });
    assert.deepEqual(lookup.mock.calls[0].arguments, ['DEMO-READY', 'ready@example.com']);
    const waiting = await post({ bookingReference: 'DEMO-WAITING', email: 'waiting@example.com' });
    assert.equal(waiting.status, 200);
    assert.deepEqual(await waiting.json(), { status: 'not_ready', roomNumber: '302' });
  });

  await t.test('Forkert reference og forkert e-mail får samme neutrale svar', async () => {
    const wrongReference = await post({ bookingReference: 'UNKNOWN', email: 'ready@example.com' });
    const wrongEmail = await post({ bookingReference: 'DEMO-READY', email: 'wrong@example.com' });
    assert.equal(wrongReference.status, 404);
    assert.equal(wrongEmail.status, 404);
    assert.deepEqual(await wrongReference.json(), await wrongEmail.json());
  });

  await t.test('Ugyldigt input og ødelagt JSON når ikke databasen', async () => {
    const before = lookup.mock.callCount();
    assert.equal((await post({ bookingReference: 123, email: 'invalid' })).status, 400);
    assert.equal((await post('{')).status, 400);
    assert.equal((await post({ bookingReference: "X' OR 1=1 --", email: 'ready@example.com' })).status, 400);
    assert.equal(lookup.mock.callCount(), before);
  });

  await t.test('Databasefejl bliver 503 uden interne fejldetaljer eller falsk status', async () => {
    lookup.mock.mockImplementationOnce(async () => { throw new Error('PRIVATE_SQL_DETAIL'); });
    const response = await post({ bookingReference: 'DEMO-READY', email: 'ready@example.com' });
    assert.equal(response.status, 503);
    const data = await response.json();
    assert.deepEqual(Object.keys(data), ['error']);
    assert.ok(!data.error.includes('PRIVATE_SQL_DETAIL'));
  });

  await t.test('Ukendt status bliver en fejl', async () => {
    lookup.mock.mockImplementationOnce(async () => ({ status: 'unexpected', roomNumber: '301' }));
    assert.equal((await post({ bookingReference: 'DEMO-READY', email: 'ready@example.com' })).status, 503);
  });

  await t.test('Opslag og tilmelding deler 10 kald; proxy-header omgår ikke grænsen', async (t) => {
    const subscribe = t.mock.method(notifications, 'subscribe', async () => null);
    const body = { bookingReference: 'UNKNOWN', email: 'ready@example.com' };
    const subscribeRequest = () => fetch(`${origin}/api/bookings/subscribe`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    for (let i = 0; i < 5; i++) {
      assert.equal((await post(body)).status, 404);
      assert.equal((await subscribeRequest()).status, 404);
    }
    const response = await post(body, { 'X-Forwarded-For': '192.0.2.100' });
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('retry-after')) > 0);
    assert.equal((await subscribeRequest()).status, 429);
    assert.equal(lookup.mock.callCount(), 5);
    assert.equal(subscribe.mock.callCount(), 5);
    now += 60001;
    assert.equal((await post(body)).status, 404);
  });
});
