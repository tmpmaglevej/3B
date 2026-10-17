const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, mockTransaction } = require('./testing');
const notifications = require('./notifications');
const app = require('./app');

test('Tilmeldings-API: bookingadgang, gentagelser og fejl uden Azure', async (t) => {
  const subscribe = t.mock.method(notifications, 'subscribe', async () => ({
    status: 'not_ready', roomNumber: '302', notificationStatus: 'waiting_for_ready',
  }));
  const origin = await startTestServer(t, app);
  const post = (body, path = '/api/bookings/subscribe') => fetch(`${origin}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const credentials = { bookingReference: ' demo-123 ', email: ' waiting@example.com ' };
  const first = await post(credentials);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.deepEqual(subscribe.mock.calls[0].arguments, ['DEMO-123', 'waiting@example.com']);
  const firstData = await first.json();
  assert.deepEqual(await (await post(credentials, '/api/bookings/SUBSCRIBE/')).json(), firstData);
  assert.equal(subscribe.mock.callCount(), 2);

  subscribe.mock.mockImplementationOnce(async () => null);
  const wrongEmail = await post({ bookingReference: 'DEMO-123', email: 'wrong@example.com' });
  subscribe.mock.mockImplementationOnce(async () => null);
  const wrongReference = await post({ bookingReference: 'UNKNOWN', email: 'waiting@example.com' });
  assert.equal(wrongEmail.status, 404);
  assert.equal(wrongReference.status, 404);
  assert.deepEqual(await wrongEmail.json(), await wrongReference.json());

  const before = subscribe.mock.callCount();
  assert.equal((await post({ bookingId: 123 })).status, 400);
  assert.equal(subscribe.mock.callCount(), before);
  subscribe.mock.mockImplementationOnce(async () => { throw new Error('PRIVATE'); });
  const failed = await post(credentials);
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes('PRIVATE'));
});

test('Tilmeldingens transaktion håndterer status og eksisterende tilmeldinger', async (t) => {
  const cases = [
    { name: 'Ikke klar får waiting_for_ready', status: 'not_ready', existing: null, expected: 'waiting_for_ready', writes: 1 },
    { name: 'Allerede Klar får pending', status: 'ready', existing: null, expected: 'pending', writes: 1 },
    { name: 'Gentaget tilmelding opretter intet nyt', status: 'not_ready', existing: 'waiting_for_ready', expected: 'waiting_for_ready', writes: 0 },
    { name: 'Klar med gammel ventende tilmelding repareres', status: 'ready', existing: 'waiting_for_ready', expected: 'pending', writes: 1 },
    { name: 'En accepteret besked oprettes ikke igen', status: 'ready', existing: 'accepted', expected: 'accepted', writes: 0 },
    { name: 'Et fejlet forsøg genstartes ikke ved tilmelding', status: 'ready', existing: 'failed', expected: 'failed', writes: 0 },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async (t) => {
      const results = [
        [{ id: 4, status: scenario.status, roomNumber: '302' }],
        scenario.existing ? [{ email_status: scenario.existing }] : [],
      ];
      if (scenario.writes) results.push([]);
      const { events, requests } = mockTransaction(t, results);
      const result = await notifications.subscribe('DEMO-123', 'waiting@example.com');
      assert.deepEqual(result, { status: scenario.status, roomNumber: '302', notificationStatus: scenario.expected });
      assert.deepEqual(events, ['begin', ...results.map(() => 'query'), 'commit']);
      assert.deepEqual(requests[0], { reference: 'DEMO-123', email: 'waiting@example.com' });
      assert.equal(requests[1].booking_id, 4);
      if (!scenario.existing) assert.deepEqual(requests[2], { booking_id: 4, email_status: scenario.expected });
    });
  }
});

test('Manglende booking og INSERT-fejl ruller tilmelding tilbage', async (t) => {
  for (const missing of [true, false]) {
    await t.test(missing ? 'Ingen booking' : 'INSERT fejler', async (t) => {
      const failure = new Error('Controlled insert failure');
      const results = missing ? [[]] : [[{ id: 4, status: 'not_ready', roomNumber: '302' }], [], failure];
      const { events } = mockTransaction(t, results);
      if (missing) assert.equal(await notifications.subscribe('UNKNOWN', 'guest@example.com'), null);
      else await assert.rejects(notifications.subscribe('DEMO-123', 'guest@example.com'), failure);
      assert.deepEqual(events, ['begin', ...results.map(() => 'query'), 'rollback']);
    });
  }
});
