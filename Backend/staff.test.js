const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, mockTransaction } = require('./testing');
const staffDatabase = require('./database');
const app = require('./app');

test('Dansk dagsdato ved midnat i sommer- og vintertid', () => {
  assert.equal(staffDatabase.getHotelDate(new Date('2026-10-17T22:30:00Z')), '2026-10-18');
  assert.equal(staffDatabase.getHotelDate(new Date('2026-10-17T21:30:00Z')), '2026-10-17');
  assert.equal(staffDatabase.getHotelDate(new Date('2026-01-17T23:30:00Z')), '2026-01-18');
});

test('Personale-API uden Azure', async (t) => {
  const room = { roomId: 1, roomNumber: '301', bookingId: 4, bookingReference: 'DEMO', status: 'not_ready', version: 1 };
  const list = t.mock.method(staffDatabase, 'listRooms', async () => [room]);
  const mark = t.mock.method(staffDatabase, 'changeBookingStatus', async () => ({
    bookingId: 4, status: 'ready', version: 2,
  }));
  const origin = await startTestServer(t, app);
  t.mock.method(staffDatabase, 'getHotelDate', () => '2026-10-17');
  t.beforeEach(() => {
    list.mock.resetCalls();
    mark.mock.resetCalls();
  });
  const patch = (id, body) => fetch(`${origin}/api/staff/bookings/${id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  await t.test('Dagsoversigt, tomt resultat og separat personaleside', async () => {
    const response = await fetch(`${origin}/api/staff/rooms`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.deepEqual(data.rooms, [room]);
    assert.deepEqual(list.mock.calls[0].arguments, [data.date]);
    list.mock.mockImplementationOnce(async () => []);
    assert.deepEqual((await (await fetch(`${origin}/api/staff/rooms`)).json()).rooms, []);
    assert.match(await (await fetch(`${origin}/staff.html`)).text(), /Dagsoversigt/);
  });

  await t.test('Ugyldige felter afvises før databasekald', async () => {
    assert.equal((await patch(4, { status: 'unknown', version: 1 })).status, 400);
    assert.equal((await patch(4, { status: 'ready', version: '1' })).status, 400);
    assert.equal((await patch('0', { status: 'ready', version: 1 })).status, 400);
    assert.equal(mark.mock.callCount(), 0);
  });

  await t.test('Ønsket status og version sendes til databasen', async () => {
    const response = await patch(4, { status: 'ready', version: 1 });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { bookingId: 4, status: 'ready', version: 2 });
    assert.deepEqual(mark.mock.calls[0].arguments, [4, 'ready', 1, staffDatabase.getHotelDate()]);
  });

  await t.test('Konflikt, ophold uden for i dag og manglende booking', async () => {
    for (const [outcome, expected] of [['conflict', 409], ['outside_today', 409], ['missing', 404]]) {
      mark.mock.mockImplementationOnce(async () => ({ error: outcome }));
      assert.equal((await patch(4, { status: 'ready', version: 1 })).status, expected);
    }
  });

  await t.test('Ikke klar sendes som ønsket status; igangværende afsendelse beskyttes', async () => {
    mark.mock.mockImplementationOnce(async () => ({ bookingId: 4, status: 'not_ready', version: 3 }));
    const response = await patch(4, { status: 'not_ready', version: 2 });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { bookingId: 4, status: 'not_ready', version: 3 });
    assert.deepEqual(mark.mock.calls.at(-1).arguments, [4, 'not_ready', 2, staffDatabase.getHotelDate()]);
    mark.mock.mockImplementationOnce(async () => ({ error: 'processing' }));
    assert.equal((await patch(4, { status: 'not_ready', version: 3 })).status, 409);
  });

  await t.test('Gentaget Klar med aktuel version returnerer uændret status', async () => {
    mark.mock.mockImplementationOnce(async () => ({ bookingId: 4, status: 'ready', version: 2 }));
    const response = await patch(4, { status: 'ready', version: 2 });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { bookingId: 4, status: 'ready', version: 2 });
  });

  await t.test('Overlappende ophold og databasefejl er fejl, uden SQL-detaljer', async () => {
    list.mock.mockImplementationOnce(async () => { const error = new Error('PRIVATE'); error.code = 'OVERLAPPING_STAYS'; throw error; });
    assert.equal((await fetch(`${origin}/api/staff/rooms`)).status, 409);
    mark.mock.mockImplementationOnce(async () => { throw new Error('PRIVATE'); });
    const response = await patch(4, { status: 'ready', version: 1 });
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('PRIVATE'));
  });
});

test('Status og tilmelding committes samlet; fejl giver rollback', async (t) => {
  for (const [status, failSubscription] of [['ready', false], ['ready', true], ['not_ready', false], ['not_ready', true]]) {
    await t.test(`${status}: ${failSubscription ? 'Databasefejl ruller status tilbage' : 'Begge ændringer før commit'}`, async (t) => {
      const booking = { bookingId: 4, status, version: 2 };
      const failure = new Error('Controlled subscription update failure');
      const { events, requests } = mockTransaction(t, [[booking], failSubscription ? failure : []]);
      if (failSubscription) {
        await assert.rejects(staffDatabase.changeBookingStatus(4, status, 1, '2026-10-17'), failure);
        assert.deepEqual(events, ['begin', 'query', 'query', 'rollback']);
      } else {
        assert.deepEqual(await staffDatabase.changeBookingStatus(4, status, 1, '2026-10-17'), booking);
        assert.deepEqual(events, ['begin', 'query', 'query', 'commit']);
      }
      assert.deepEqual(requests[0], { id: 4, status, version: 1, today: '2026-10-17' });
      assert.deepEqual(requests[1], {
        id: 4,
        status: status === 'ready' ? 'pending' : 'waiting_for_ready',
        previous: status === 'ready' ? 'waiting_for_ready' : 'pending',
      });
    });
  }
});

test('Afviste og uændrede statuskald ændrer ikke tilmeldingen', async (t) => {
  for (const [current, status, outcome] of [
    [null, 'ready', 'missing'],
    [{ isToday: 0, status: 'not_ready', version: 1 }, 'ready', 'outside_today'],
    [{ isToday: 1, status: 'ready', version: 2 }, 'ready', 'conflict'],
    [{ isToday: 1, status: 'ready', version: 1 }, 'ready', 'unchanged'],
    [{ isToday: 1, status: 'ready', version: 1, isProcessing: 1 }, 'not_ready', 'processing'],
  ]) {
    await t.test(outcome, async (t) => {
      const { events } = mockTransaction(t, [[], current ? [current] : []]);
      const result = await staffDatabase.changeBookingStatus(4, status, 1, '2026-10-17');
      if (outcome === 'unchanged') assert.deepEqual(result, { bookingId: 4, status: 'ready', version: 1 });
      else assert.deepEqual(result, { error: outcome });
      assert.deepEqual(events, ['begin', 'query', 'query', 'rollback']);
    });
  }
});
