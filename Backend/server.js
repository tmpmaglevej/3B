const app = require('./app');
const database = require('./database');
const notifications = require('./notifications');
const port = Number(process.env.PORT || 3002);
let stopEmailWorker = async () => {};

// Serveren er kun til lokal udvikling på denne computer.
const server = app.listen(port, '127.0.0.1', (err) => {
  if (err) return;
  console.log(`Hotel Room Status kører på http://127.0.0.1:${server.address().port}`);
  stopEmailWorker = notifications.startEmailWorker();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} er allerede i brug. Stop den anden server, eller vælg en anden PORT.`);
  } else {
    console.error('Serveren kunne ikke starte. Kontrollér port og lokal netværksopsætning.');
  }
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    const emailStopped = stopEmailWorker();
    server.close(async () => {
      await emailStopped;
      await database.closePool().catch(() => {});
    });
  });
}
