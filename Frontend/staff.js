import { requestJson } from './api.js';

const refreshButton = document.querySelector('#refresh-button');
const message = document.querySelector('#staff-message');
const tableContainer = document.querySelector('#staff-table-container');
const roomsBody = document.querySelector('#rooms-body');
const state = { rooms: [], busy: false, needsRefresh: false, message: '' };

function render() {
  refreshButton.disabled = state.busy;
  tableContainer.setAttribute('aria-busy', String(state.busy));
  message.textContent = state.message;
  roomsBody.replaceChildren();

  for (const room of state.rooms) {
    const row = document.createElement('tr');
    const roomCell = document.createElement('td');
    roomCell.textContent = room.roomNumber;
    const statusCell = document.createElement('td');
    statusCell.textContent = room.status === 'ready' ? 'Klar' : room.status === 'not_ready' ? 'Ikke klar' : 'Intet aktuelt ophold';
    if (room.status) statusCell.classList.add(room.status === 'ready' ? 'status-ready' : 'status-waiting');
    const bookingCell = document.createElement('td');
    bookingCell.textContent = room.bookingReference || '—';
    const actionCell = document.createElement('td');
    if (room.bookingId !== null) {
      const actions = document.createElement('div');
      actions.classList.add('status-actions');
      for (const [status, label] of [['ready', 'Klar'], ['not_ready', 'Ikke klar']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.classList.add(status === 'ready' ? 'button-ready' : 'button-not-ready');
        button.setAttribute('aria-label', `Sæt værelse ${room.roomNumber} til ${label.toLowerCase()}`);
        button.disabled = state.busy || state.needsRefresh || room.status === status;
        button.addEventListener('click', () => saveStatus(room, status));
        actions.append(button);
      }
      actionCell.append(actions);
    } else actionCell.textContent = '—';
    row.append(roomCell, statusCell, bookingCell, actionCell);
    roomsBody.append(row);
  }
}

async function loadRooms() {
  if (state.busy) return;
  state.busy = true;
  state.needsRefresh = true;
  state.message = 'Henter værelsesoversigt…';
  render();
  try {
    const data = await requestJson('/api/staff/rooms');
    if (!Array.isArray(data?.rooms) || typeof data.date !== 'string'
        || !data.rooms.every((room) => room && typeof room.roomNumber === 'string'
          && (room.bookingId === null || (Number.isInteger(room.bookingId)
            && ['ready', 'not_ready'].includes(room.status) && Number.isInteger(room.version))))) {
      throw new Error('Serveren sendte et ugyldigt svar.');
    }
    state.rooms = data.rooms;
    state.needsRefresh = false;
    state.message = state.rooms.length ? `Dagsoversigten for ${data.date} er opdateret.` : 'Der er ingen værelser at vise.';
  } catch (error) {
    state.rooms = [];
    state.message = ['TypeError', 'TimeoutError', 'SyntaxError'].includes(error.name)
      ? 'Kunne ikke hente oversigten. Kontrollér forbindelsen, og prøv igen.'
      : error.message || 'Oversigten kunne ikke hentes.';
  } finally {
    state.busy = false;
    render();
  }
}

async function saveStatus(room, desiredStatus) {
  if (state.busy || state.needsRefresh || room.status === desiredStatus) return;
  state.busy = true;
  state.message = `Gemmer status for værelse ${room.roomNumber}…`;
  render();
  try {
    const data = await requestJson(`/api/staff/bookings/${room.bookingId}/status`, {
      method: 'PATCH',
      body: { status: desiredStatus, version: room.version },
    });
    if (data?.bookingId === room.bookingId && data.status === desiredStatus && Number.isInteger(data.version)) {
      room.status = data.status;
      room.version = data.version;
      state.message = `Status for værelse ${room.roomNumber} er gemt.`;
    } else {
      state.needsRefresh = true;
      state.message = 'Serveren sendte et ugyldigt svar. Tryk Opdatér oversigt for at kontrollere status.';
    }
  } catch (error) {
    // Et fejlet eller ubekræftet kald kræver et nyt opslag før næste ændring.
    state.needsRefresh = true;
    state.message = error.status
      ? `${error.message || 'Status kunne ikke gemmes.'} Tryk Opdatér oversigt før næste ændring.`
      : 'Forbindelsen blev afbrudt. Ændringen kan være gemt. Tryk Opdatér oversigt for at kontrollere status.';
  } finally {
    state.busy = false;
    render();
  }
}

refreshButton.addEventListener('click', loadRooms);
loadRooms();
