const express = require('express');
const path = require('node:path');
const database = require('./database');
const notifications = require('./notifications');
const lookupAttempts = new Map();

const app = express();

app.disable('x-powered-by');

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Opslag og tilmelding deler grænsen, fordi begge kan bruges til at gætte bookinger.
app.post(['/api/bookings/lookup', '/api/bookings/subscribe'], (req, res, next) => {
  const now = Date.now();
  for (const [ip, attempts] of lookupAttempts) {
    if (attempts.expiresAt <= now) lookupAttempts.delete(ip);
  }
  let attempts = lookupAttempts.get(req.ip);
  if (!attempts) {
    attempts = { count: 0, expiresAt: now + 60000 };
    lookupAttempts.set(req.ip, attempts);
  }
  attempts.count += 1;
  res.set('Cache-Control', 'no-store');
  if (attempts.count > 10) {
    res.set('Retry-After', String(Math.ceil((attempts.expiresAt - now) / 1000)));
    return res.status(429).json({ error: 'For mange opslag. Vent et minut, og prøv igen.' });
  }
  next();
}, express.json({ limit: '2kb' }), async (req, res) => {
  const { bookingReference, email } = req.body || {};
  const reference = typeof bookingReference === 'string' ? bookingReference.trim().toUpperCase() : '';
  const address = typeof email === 'string' ? email.trim() : '';
  if (!/^[A-Z0-9-]{1,40}$/.test(reference) || address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return res.status(400).json({ error: 'Angiv en gyldig bookingreference og e-mailadresse.' });
  }
  const subscribing = /\/subscribe\/?$/i.test(req.path);
  try {
    const booking = subscribing
      ? await notifications.subscribe(reference, address)
      : await database.findBooking(reference, address);
    if (!booking) return res.status(404).json({ error: 'Ingen booking matcher de angivne oplysninger.' });
    if (!['ready', 'not_ready'].includes(booking.status)) throw new Error('Invalid booking status');
    if (!booking.notificationStatus) delete booking.notificationStatus;
    res.json(booking);
  } catch {
    res.status(503).json({ error: subscribing
      ? 'Tilmeldingen kunne ikke bekræftes. Prøv igen senere.'
      : 'Bookingopslag er midlertidigt utilgængeligt. Prøv igen senere.' });
  }
});

app.use('/api/staff', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/staff/rooms', async (req, res) => {
  try {
    const date = database.getHotelDate();
    const rooms = await database.listRooms(date);
    res.json({ date, rooms });
  } catch (error) {
    if (error.code === 'OVERLAPPING_STAYS') {
      return res.status(409).json({ error: 'Flere ophold overlapper på samme værelse i dag. Kontrollér bookingdata.' });
    }
    console.error('Personaleoversigten kunne ikke hentes.');
    res.status(503).json({ error: 'Oversigten er midlertidigt utilgængelig. Prøv igen senere.' });
  }
});

app.patch('/api/staff/bookings/:id/status', express.json({ limit: '2kb' }), async (req, res) => {
  const bookingId = Number(req.params.id);
  const { status, version } = req.body || {};
  if (!/^\d+$/.test(req.params.id) || !Number.isInteger(bookingId) || bookingId < 1 || bookingId > 2147483647
      || !Number.isInteger(version) || version < 1 || version >= 2147483647
      || !['ready', 'not_ready'].includes(status)) {
    return res.status(400).json({ error: 'Angiv gyldig booking, status og version.' });
  }
  try {
    const result = await database.changeBookingStatus(bookingId, status, version, database.getHotelDate());
    if (result.error === 'processing') {
      return res.status(409).json({ error: 'En besked er ved at blive sendt. Vent, og opdatér oversigten før tilbageførsel.' });
    }
    if (result.error === 'missing') {
      return res.status(404).json({ error: 'Bookingen findes ikke.' });
    }
    if (result.error === 'outside_today') {
      return res.status(409).json({ error: 'Bookingen gælder ikke dagsoversigten længere.' });
    }
    if (result.error === 'conflict') {
      return res.status(409).json({ error: 'Bookingen er ændret siden dit opslag.' });
    }
    res.json(result);
  } catch {
    console.error('Personaleændringen kunne ikke gennemføres.');
    res.status(503).json({ error: 'Status kunne ikke bekræftes. Opdatér oversigten for at kontrollere resultatet.' });
  }
});

app.use(express.static(path.join(__dirname, '..', 'Frontend')));

app.use((req, res) => {
  res.status(404).json({ error: 'Den ønskede ressource findes ikke.' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(err.status).json({ error: 'Ugyldigt requestindhold.' });
  }
  console.error('Uventet serverfejl.');
  res.status(500).json({ error: 'Der opstod en serverfejl. Prøv igen senere.' });
});

module.exports = app;
