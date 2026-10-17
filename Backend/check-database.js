const database = require('./database');

async function checkDatabase() {
  try {
    const pool = await database.getPool();
    const result = await pool.request().query(`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME IN ('rooms', 'bookings', 'notification_subscriptions')
      ORDER BY TABLE_NAME, ORDINAL_POSITION;
    `);
    console.log('Forbindelse til Azure SQL lykkedes. Ingen data er ændret.');
    if (result.recordset.length) console.table(result.recordset);
    else console.log('De tre projekttabeller findes ikke eller er ikke synlige for denne bruger.');
  } catch (error) {
    if (error.code === 'DB_CONFIG') console.error(error.message);
    else console.error('Kunne ikke læse fra Azure SQL. Kontrollér lokal .env, brugerrettigheder og adgang fra din IP i Azure-firewallen.');
    process.exitCode = 1;
  } finally {
    await database.closePool().catch(() => {});
  }
}

checkDatabase();
