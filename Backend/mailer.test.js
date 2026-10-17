const { test } = require('node:test');
const assert = require('node:assert/strict');
const mailer = require('./mailer');
const nodemailer = require('nodemailer');
const notifications = require('./notifications');
const database = require('./database');

function setTestEnvironment(t) {
  const values = {
    MAIL_ENABLED: 'true', GMAIL_USER: 'project@gmail.com', GMAIL_APP_PASSWORD: 'test-password-no-access',
    MAIL_TEST_RECIPIENT: 'group@example.com',
  };
  const previous = {};
  for (const [name, value] of Object.entries(values)) {
    previous[name] = process.env[name];
    process.env[name] = value;
  }
  t.after(() => {
    for (const name of Object.keys(values)) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
}

test('Gmail via Nodemailer uden netværkskald', async (t) => {
  setTestEnvironment(t);
  const smtp = { async sendMail(data) {
    assert.equal(data.from, 'project@gmail.com');
    assert.equal(data.to, 'group@example.com');
    assert.ok(!JSON.stringify(data).includes('real-guest@example.com'));
    assert.match(data.text, /302/);
    return { messageId: 'test-message-id', accepted: ['group@example.com'], rejected: [] };
  } };
  const send = t.mock.method(smtp, 'sendMail');
  const create = t.mock.method(nodemailer, 'createTransport', (config) => {
    assert.equal(config.service, 'gmail');
    assert.deepEqual(config.auth, { user: 'project@gmail.com', pass: 'test-password-no-access' });
    assert.equal(config.socketTimeout, 10000);
    return smtp;
  });
  const notification = { id: 4, email: 'real-guest@example.com', roomNumber: '302' };
  // Opret den erstattede transport før deltestene, så deres rækkefølge er fri.
  await mailer.sendReadyNotification(notification);
  t.beforeEach((t) => {
    setTestEnvironment(t);
    send.mock.resetCalls();
  });

  await t.test('Accept sender kun til testmodtager og genbruger transporten', async () => {
    assert.equal((await mailer.sendReadyNotification({ id: 4, roomNumber: '302' })).messageId, 'test-message-id');
    await mailer.sendReadyNotification(notification);
    assert.equal(create.mock.callCount(), 1);
    assert.equal(send.mock.callCount(), 2);
  });
  await t.test('Loginfejl og SMTP-afvisning bliver sikre fejlkoder', async () => {
    for (const [original, expected] of [
      [{ code: 'EAUTH' }, 'SMTP_AUTH_FAILED'],
      [{ responseCode: 550 }, 'SMTP_REJECTED'],
    ]) {
      send.mock.mockImplementationOnce(async () => { throw Object.assign(new Error('PRIVATE'), original); });
      await assert.rejects(mailer.sendReadyNotification(notification), { code: expected });
    }
    assert.equal(send.mock.callCount(), 2);
  });
  await t.test('Forbindelsesbrud giver ukendt udfald uden genforsøg', async () => {
    send.mock.mockImplementationOnce(async () => { throw new Error('PRIVATE NETWORK DETAILS'); });
    await assert.rejects(mailer.sendReadyNotification(notification), { code: 'OUTCOME_UNKNOWN' });
    assert.equal(send.mock.callCount(), 1);
  });
  await t.test('Afvist eller ubekræftet modtager er ikke accept', async () => {
    send.mock.mockImplementationOnce(async () => ({ accepted: [], rejected: ['group@example.com'] }));
    await assert.rejects(mailer.sendReadyNotification(notification), { code: 'SMTP_REJECTED' });
    send.mock.mockImplementationOnce(async () => ({ accepted: [], rejected: [] }));
    await assert.rejects(mailer.sendReadyNotification(notification), { code: 'OUTCOME_UNKNOWN' });
    assert.equal(send.mock.callCount(), 2);
  });
  await t.test('Slået fra eller manglende testmodtager sender intet', async () => {
    process.env.MAIL_ENABLED = 'false';
    await assert.rejects(mailer.sendReadyNotification(notification));
    process.env.MAIL_ENABLED = 'true';
    delete process.env.MAIL_TEST_RECIPIENT;
    await assert.rejects(mailer.sendReadyNotification(notification));
    assert.equal(send.mock.callCount(), 0);
  });
});

test('Beskedbehandling: ét forsøg, lagring og usikre udfald', async (t) => {
  let results, queries;
  const pool = { request() {
    const parameters = {};
    return {
      input(name, type, value) { parameters[name] = value; return this; },
      async query(text) {
        queries.push({ text, parameters });
        assert.ok(results.length, 'Uventet ekstra SQL-kald');
        const result = results.shift();
        if (result instanceof Error) throw result;
        return result;
      },
    };
  } };
  t.mock.method(database, 'getPool', async () => pool);
  const send = t.mock.method(mailer, 'sendReadyNotification', async () => {
    assert.equal(queries.length, 2, 'Beskeden overtages og værelset hentes før SMTP');
  });
  t.beforeEach((t) => {
    setTestEnvironment(t);
    queries = [];
    results = [{ recordset: [{ id: 4, booking_id: 7 }] }, { recordset: [{ roomNumber: '302' }] }, { rowsAffected: [1] }];
    send.mock.resetCalls();
  });

  await t.test('Uden mailopsætning overtages intet arbejde', async () => {
    process.env.MAIL_ENABLED = 'false';
    assert.equal(await notifications.processNextNotification(), false);
    process.env.MAIL_ENABLED = 'true';
    delete process.env.MAIL_TEST_RECIPIENT;
    await assert.rejects(notifications.processNextNotification());
    assert.equal(queries.length, 0);
    assert.equal(send.mock.callCount(), 0);
  });
  await t.test('Accept gemmes efter afsendelsen', async () => {
    assert.equal(await notifications.processNextNotification(), true);
    assert.equal(queries.length, 3);
    assert.match(queries[0].text, /AND email_status = 'pending' AND email_attempts = 0/);
    assert.match(queries[0].text, /b.status = 'ready'/);
    assert.deepEqual(queries[1].parameters, { id: 7 });
    assert.deepEqual(send.mock.calls[0].arguments, [{ roomNumber: '302' }]);
    assert.deepEqual(queries[2].parameters, { id: 4, status: 'accepted', error: null });
    assert.match(queries[2].text, /email_status = 'processing' AND email_attempts = 1/);
    assert.equal(send.mock.callCount(), 1);
  });
  await t.test('Intet pending arbejde sender intet', async () => {
    results = [{ recordset: [] }];
    assert.equal(await notifications.processNextNotification(), false);
    assert.equal(queries.length, 1);
    assert.equal(send.mock.callCount(), 0);
  });
  await t.test('Afsendelsesfejl gemmes sikkert uden genforsøg', async () => {
    send.mock.mockImplementationOnce(async () => { throw new Error('PRIVATE'); });
    assert.equal(await notifications.processNextNotification(), true);
    assert.equal(queries.length, 3);
    assert.deepEqual(queries[2].parameters, { id: 4, status: 'failed', error: 'OUTCOME_UNKNOWN' });
    assert.equal(send.mock.callCount(), 1);
  });
  await t.test('Fejl efter accept omskrives ikke til failed og udløser intet ekstra send', async () => {
    results[2] = new Error('Controlled database failure');
    await assert.rejects(notifications.processNextNotification());
    assert.equal(queries.length, 3);
    assert.deepEqual(queries[2].parameters, { id: 4, status: 'accepted', error: null });
    assert.equal(send.mock.callCount(), 1);
  });
  await t.test('Manglende lagring af resultatet er en fejl', async () => {
    results[2] = { rowsAffected: [0] };
    await assert.rejects(notifications.processNextNotification());
    assert.equal(queries.length, 3);
    assert.equal(send.mock.callCount(), 1);
  });
  await t.test('Fejl efter overtagelse sender intet og nulstiller ikke forsøget', async () => {
    results[1] = new Error('Controlled room lookup failure');
    await assert.rejects(notifications.processNextNotification());
    assert.equal(queries.length, 2);
    assert.equal(send.mock.callCount(), 0);
  });
  await t.test('Mailbehandleren overlapper ikke og afventer forsøget ved stop', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let release;
    const sending = new Promise((resolve) => { release = resolve; });
    send.mock.mockImplementationOnce(() => sending);
    const stop = notifications.startEmailWorker();
    await new Promise(setImmediate);
    assert.equal(send.mock.callCount(), 1);
    t.mock.timers.tick(10000);
    assert.equal(queries.length, 2, 'Et aktivt forsøg må ikke overlappes');
    let stopped = false;
    const stopping = stop().then(() => { stopped = true; });
    await new Promise(setImmediate);
    assert.equal(stopped, false, 'Stop skal vente på SMTP og lagring');
    release();
    await stopping;
    t.mock.timers.tick(10000);
    await new Promise(setImmediate);
    assert.equal(queries.length, 3, 'Stop må ikke efterlade en ny planlagt behandling');
    assert.equal(send.mock.callCount(), 1);
  });
});
