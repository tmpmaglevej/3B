import { requestJson } from './api.js';

const bookingForm = document.querySelector('#booking-form');
const statusButton = document.querySelector('#status-button');
const bookingMessage = document.querySelector('#booking-message');

const referenceInput = document.querySelector('#booking-reference');
const emailInput = document.querySelector('#email');
const subscriptionForm = document.querySelector('#subscription-form');
const subscribeButton = document.querySelector('#subscribe-button');
const subscriptionMessage = document.querySelector('#subscription-message');
const notificationMessages = {
  waiting_for_ready: 'Du er tilmeldt besked, når værelset bliver klart.',
  pending: 'Du er tilmeldt. Beskeden afventer behandling.',
  processing: 'Du er tilmeldt. Beskeden afventer behandling.',
  accepted: 'Mailtjenesten har tidligere accepteret en besked for denne booking. Den aktuelle værelsesstatus vises ovenfor. Der sendes ikke en ny besked.',
  failed: 'Tilmeldingen er gemt, men afsendelsen kunne ikke bekræftes. Kontakt receptionen.',
};
const state = { booking: null, pending: null, error: '', subscriptionError: '' };

function clearBooking() {
  state.booking = null;
  state.error = '';
  state.subscriptionError = '';
}

function isBooking(data) {
  return data && ['ready', 'not_ready'].includes(data.status) && typeof data.roomNumber === 'string'
    && (data.notificationStatus === undefined || (typeof data.notificationStatus === 'string'
      && Object.hasOwn(notificationMessages, data.notificationStatus)));
}

function render() {
  const busy = state.pending !== null;
  const loading = state.pending === 'lookup';
  const subscribing = state.pending === 'subscribe';
  statusButton.disabled = busy;
  referenceInput.disabled = busy;
  emailInput.disabled = busy;
  bookingForm.setAttribute('aria-busy', String(loading));
  bookingMessage.classList.toggle('status-ready', state.booking?.status === 'ready');
  bookingMessage.classList.toggle('status-waiting', state.booking?.status === 'not_ready');
  if (loading) bookingMessage.textContent = 'Henter bookingstatus…';
  else if (state.error) bookingMessage.textContent = state.error;
  else if (state.booking?.status === 'ready') {
    bookingMessage.textContent = `Værelse ${state.booking.roomNumber} er klar. Henvend dig i receptionen efter nøglen.`;
  } else if (state.booking?.status === 'not_ready') {
    bookingMessage.textContent = `Værelse ${state.booking.roomNumber} er ikke klar.`;
  } else bookingMessage.textContent = '';
  subscriptionForm.hidden = state.booking?.status !== 'not_ready';
  subscribeButton.disabled = busy || Boolean(state.booking?.notificationStatus);
  subscriptionForm.setAttribute('aria-busy', String(subscribing));
  if (subscribing) subscriptionMessage.textContent = 'Registrerer tilmelding…';
  else if (state.subscriptionError) subscriptionMessage.textContent = state.subscriptionError;
  else subscriptionMessage.textContent = notificationMessages[state.booking?.notificationStatus] || '';
}

// Begge formularer bruger de samme bookingoplysninger og det samme API-format.
async function submitBooking(event) {
  event.preventDefault();
  const subscribing = event.currentTarget === subscriptionForm;
  if (state.pending || (subscribing && (!state.booking || state.booking.notificationStatus))) return;
  const credentials = { bookingReference: referenceInput.value, email: emailInput.value };
  const errorField = subscribing ? 'subscriptionError' : 'error';
  if (!subscribing) clearBooking();
  state.pending = subscribing ? 'subscribe' : 'lookup';
  state[errorField] = '';
  render();
  try {
    const data = await requestJson(`/api/bookings/${state.pending}`, { method: 'POST', body: credentials });
    if (isBooking(data) && (!subscribing || data.notificationStatus !== undefined)) {
      state.booking = data;
    } else {
      state[errorField] = subscribing
        ? 'Serveren sendte et ugyldigt svar. Tilmeldingen kunne ikke bekræftes.'
        : 'Serveren sendte et ugyldigt svar. Prøv igen senere.';
    }
  } catch (error) {
    if (error.status) {
      state[errorField] = error.message || (subscribing
        ? 'Tilmeldingen kunne ikke bekræftes.' : 'Bookingopslag mislykkedes. Prøv igen senere.');
    } else {
      state[errorField] = subscribing
        ? 'Tilmeldingen kunne ikke bekræftes. Kontrollér forbindelsen, og prøv igen.'
        : 'Kunne ikke hente status. Kontrollér forbindelsen, og prøv igen senere.';
    }
  } finally {
    state.pending = null;
    render();
  }
}

bookingForm.addEventListener('submit', submitBooking);
subscriptionForm.addEventListener('submit', submitBooking);

// Fjern et gammelt resultat, når gæsten ændrer bookingoplysningerne.
bookingForm.addEventListener('input', () => {
  clearBooking();
  render();
});

// Aktivér først formularen, når submit-handleren forhindrer almindelig afsendelse.
render();
