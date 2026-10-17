const sql = require('mssql');
const database = require('./database');
const mailer = require('./mailer');

async function subscribe(bookingReference, email) {
  const pool = await database.getPool();
  const transaction = pool.transaction();
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    // Lås bookingen før tilmelding, så statusændringen og tilmeldingen får en rækkefølge.
    const matched = await transaction.request()
      .input('reference', sql.VarChar(40), bookingReference)
      .input('email', sql.NVarChar(254), email)
      .query(`
        SELECT b.id, b.status, r.room_number AS roomNumber
        FROM dbo.bookings AS b WITH (UPDLOCK)
        INNER JOIN dbo.rooms AS r ON r.id = b.room_id
        WHERE b.booking_reference = @reference AND b.email = @email;
      `);
    const booking = matched.recordset[0];
    if (!booking) {
      await transaction.rollback();
      return null;
    }
    if (!['ready', 'not_ready'].includes(booking.status)) throw new Error('Invalid booking status');

    const existing = await transaction.request()
      .input('booking_id', sql.Int, booking.id)
      .query('SELECT email_status FROM dbo.notification_subscriptions WHERE booking_id = @booking_id;');

    const emailStatus = booking.status === 'ready' ? 'pending' : 'waiting_for_ready';
    let notificationStatus = existing.recordset[0]?.email_status;
    if (!notificationStatus) {
      await transaction.request()
        .input('booking_id', sql.Int, booking.id)
        .input('email_status', sql.VarChar(30), emailStatus)
        .query(`
          INSERT INTO dbo.notification_subscriptions (booking_id, email_status)
          VALUES (@booking_id, @email_status);
        `);
      notificationStatus = emailStatus;
    } else if (booking.status === 'ready' && notificationStatus === 'waiting_for_ready') {
      await transaction.request()
        .input('booking_id', sql.Int, booking.id)
        .query(`
          UPDATE dbo.notification_subscriptions SET email_status = 'pending'
          WHERE booking_id = @booking_id AND email_status = 'waiting_for_ready';
        `);
      notificationStatus = 'pending';
    }
    await transaction.commit();
    return { status: booking.status, roomNumber: booking.roomNumber, notificationStatus };
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

async function processNextNotification() {
  if (process.env.MAIL_ENABLED !== 'true') return false;
  // Manglende konfiguration må ikke bruge et afsendelsesforsøg.
  mailer.validateConfiguration();
  const pool = await database.getPool();
  // Både udvælgelsen og kontrollen i UPDATE kræver pending/0 forsøg.
  // To processer kan derfor ikke begge overtage samme tilmelding.
  const claimed = await pool.request().query(`
    UPDATE dbo.notification_subscriptions
    SET email_status = 'processing', email_attempts = email_attempts + 1,
        email_attempted_at = SYSUTCDATETIME(), email_last_error = NULL
    OUTPUT INSERTED.id, INSERTED.booking_id
    WHERE id = (
      SELECT TOP (1) n.id FROM dbo.notification_subscriptions AS n
      INNER JOIN dbo.bookings AS b ON b.id = n.booking_id
      WHERE n.email_status = 'pending' AND n.email_attempts = 0 AND b.status = 'ready'
      ORDER BY n.subscribed_at, n.id
    ) AND email_status = 'pending' AND email_attempts = 0;
  `);
  const notification = claimed.recordset[0];
  if (!notification) return false;
  const booking = await pool.request()
    .input('id', sql.Int, notification.booking_id)
    .query(`
      SELECT r.room_number AS roomNumber
      FROM dbo.bookings AS b INNER JOIN dbo.rooms AS r ON r.id = b.room_id
      WHERE b.id = @id;
    `);
  if (!booking.recordset[0]) throw new Error('Missing notification booking');
  let errorCode = null;
  try {
    await mailer.sendReadyNotification(booking.recordset[0]);
  } catch (error) {
    errorCode = ['SMTP_AUTH_FAILED', 'SMTP_REJECTED'].includes(error.code) ? error.code : 'OUTCOME_UNKNOWN';
  }
  // Lagringen ligger uden for SMTP-catch. Fejler den, bliver rækken processing.
  const result = await pool.request()
    .input('id', sql.Int, notification.id)
    .input('status', sql.VarChar(30), errorCode ? 'failed' : 'accepted')
    .input('error', sql.NVarChar(100), errorCode)
    .query(`
      UPDATE dbo.notification_subscriptions
      SET email_status = @status, email_last_error = @error,
          email_accepted_at = CASE WHEN @status = 'accepted' THEN SYSUTCDATETIME() ELSE NULL END
      WHERE id = @id AND email_status = 'processing' AND email_attempts = 1;
    `);
  if (result.rowsAffected[0] !== 1) throw new Error('Notification outcome could not be stored');
  return true;
}

function startEmailWorker() {
  if (process.env.MAIL_ENABLED !== 'true') return async () => {};
  try {
    mailer.validateConfiguration();
  } catch (error) {
    console.error(error.message);
    return async () => {};
  }
  let stopped = false;
  let timer;
  async function tick() {
    try {
      await processNextNotification();
    } catch {
      console.error('Mailbehandling kunne ikke bekræftes. Kontrollér database og afsendelsesstatus.');
    }
    if (!stopped) timer = setTimeout(() => { running = tick(); }, 5000);
  }
  let running = tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}

module.exports = { subscribe, processNextNotification, startEmailWorker };
