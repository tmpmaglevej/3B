const sql = require('mssql');

let poolPromise;

function getPool() {
  if (!poolPromise) {
    const required = ['DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD'];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length) {
      const error = new Error(`Udfyld ${missing.join(', ')} i din lokale .env.`);
      error.code = 'DB_CONFIG';
      throw error;
    }

    const pool = new sql.ConnectionPool({
      server: process.env.DB_SERVER,
      database: process.env.DB_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: 1433,
      connectionTimeout: 10000,
      requestTimeout: 10000,
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
      options: { encrypt: true, trustServerCertificate: false },
    });

    pool.on('error', () => console.error('Fejl i databaseforbindelsespuljen.'));
    poolPromise = pool.connect().catch(async (error) => {
      await pool.close().catch(() => {});
      poolPromise = undefined;
      throw error;
    });
  }
  return poolPromise;
}

async function closePool() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = undefined;
  }
}

async function findBooking(bookingReference, email) {
  const pool = await database.getPool();
  const result = await pool.request()
    .input('booking_reference', sql.VarChar(40), bookingReference)
    .input('email', sql.NVarChar(254), email)
    .query(`
      SELECT b.status, r.room_number AS roomNumber, n.email_status AS notificationStatus
      FROM dbo.bookings AS b
      INNER JOIN dbo.rooms AS r ON r.id = b.room_id
      LEFT JOIN dbo.notification_subscriptions AS n ON n.booking_id = b.id
      WHERE b.booking_reference = @booking_reference AND b.email = @email;
    `);
  return result.recordset[0] || null;
}

function getHotelDate(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

async function listRooms(today) {
  const pool = await database.getPool();
  const result = await pool.request()
    .input('today', sql.Date, today)
    .query(`
      SELECT r.id AS roomId, r.room_number AS roomNumber,
             b.id AS bookingId, b.booking_reference AS bookingReference,
             b.status, b.version
      FROM dbo.rooms AS r
      LEFT JOIN dbo.bookings AS b ON b.room_id = r.id
        AND b.arrival_date <= @today AND b.departure_date > @today
      ORDER BY r.room_number;
    `);
  // Overlappende ophold må ikke lydløst udvælge den forkerte gæst.
  const roomIds = new Set(result.recordset.map((room) => room.roomId));
  if (roomIds.size !== result.recordset.length) {
    const error = new Error('Overlapping stays');
    error.code = 'OVERLAPPING_STAYS';
    throw error;
  }
  return result.recordset;
}

async function changeBookingStatus(bookingId, status, version, today) {
  const pool = await database.getPool();
  const transaction = pool.transaction();
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    // Versionskontrollen indgår i selve UPDATE, så kun én samtidig ændring vinder.
    const updated = await transaction.request()
      .input('id', sql.Int, bookingId)
      .input('version', sql.Int, version)
      .input('status', sql.VarChar(20), status)
      .input('today', sql.Date, today)
      .query(`
        UPDATE dbo.bookings
        SET status = @status, version = version + 1
        OUTPUT INSERTED.id AS bookingId, INSERTED.status, INSERTED.version
        WHERE id = @id AND version = @version AND status <> @status
          AND arrival_date <= @today AND departure_date > @today
          AND (@status = 'ready' OR NOT EXISTS (
            SELECT 1 FROM dbo.notification_subscriptions
            WHERE booking_id = @id AND email_status = 'processing'
          ));
      `);

    if (!updated.recordset.length) {
      const current = await transaction.request()
        .input('id', sql.Int, bookingId)
        .input('today', sql.Date, today)
        .query(`
          SELECT id AS bookingId, status, version,
                 CASE WHEN arrival_date <= @today AND departure_date > @today
                      THEN 1 ELSE 0 END AS isToday,
                 CASE WHEN EXISTS (
                   SELECT 1 FROM dbo.notification_subscriptions
                   WHERE booking_id = @id AND email_status = 'processing'
                 ) THEN 1 ELSE 0 END AS isProcessing
          FROM dbo.bookings WHERE id = @id;
        `);
      await transaction.rollback();
      const booking = current.recordset[0];
      if (!booking) return { error: 'missing' };
      if (!booking.isToday) return { error: 'outside_today' };
      if (booking.version !== version) return { error: 'conflict' };
      if (booking.status === status) {
        return { bookingId, status, version };
      }
      if (status === 'not_ready' && booking.isProcessing) return { error: 'processing' };
      throw new Error('Unexpected booking state');
    }

    // Kun beskeder uden forsøg kan flyttes mellem ventende og klar til afsendelse.
    // Accepted/failed og forsøgshistorik bevares ved ændring af værelsesstatus.
    await transaction.request()
      .input('id', sql.Int, bookingId)
      .input('status', sql.VarChar(30), status === 'ready' ? 'pending' : 'waiting_for_ready')
      .input('previous', sql.VarChar(30), status === 'ready' ? 'waiting_for_ready' : 'pending')
      .query(`
        UPDATE dbo.notification_subscriptions
        SET email_status = @status
        WHERE booking_id = @id AND email_status = @previous AND email_attempts = 0;
      `);
    await transaction.commit();
    return updated.recordset[0];
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

const database = { getPool, closePool, findBooking, getHotelDate, listRooms, changeBookingStatus };
module.exports = database;
