const nodemailer = require('nodemailer');

let transporter;

function validateConfiguration() {
  const required = ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'MAIL_TEST_RECIPIENT'];
  const missing = required.filter((name) => !process.env[name]);
  const address = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
  if (missing.length || !address.test(process.env.GMAIL_USER || '') || !address.test(process.env.MAIL_TEST_RECIPIENT || '')) {
    throw new Error('Udfyld GMAIL_USER, GMAIL_APP_PASSWORD og én MAIL_TEST_RECIPIENT i .env.');
  }
}

async function sendReadyNotification(notification) {
  if (process.env.MAIL_ENABLED !== 'true') throw new Error('Mailafsendelse er slået fra.');
  validateConfiguration();
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }
  try {
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER,
      // Lokal studieprototype: send altid til gruppens testindbakke.
      to: process.env.MAIL_TEST_RECIPIENT,
      subject: 'Dit værelse er klart',
      text: `Værelse ${notification.roomNumber} er klart. Henvend dig i receptionen efter nøglen.`,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    if (!info.accepted?.some((address) => typeof address === 'string'
        && address.toLowerCase() === process.env.MAIL_TEST_RECIPIENT.toLowerCase())) {
      const error = new Error('SMTP-serveren bekræftede ikke modtageren.');
      error.code = info.rejected?.length ? 'SMTP_REJECTED' : 'OUTCOME_UNKNOWN';
      throw error;
    }
    return info;
  } catch (original) {
    // Gem kun en ufølsom kode, aldrig rå SMTP-svar, modtagere eller credentials.
    const error = new Error('Mailafsendelsen kunne ikke bekræftes.');
    if (original.code === 'EAUTH') error.code = 'SMTP_AUTH_FAILED';
    else if (original.code === 'SMTP_REJECTED' || (original.responseCode >= 400 && original.responseCode < 600)) error.code = 'SMTP_REJECTED';
    else error.code = 'OUTCOME_UNKNOWN';
    throw error;
  }
}

module.exports = { validateConfiguration, sendReadyNotification };
