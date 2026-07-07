  const grid = createGridElement();
  grid.append(createCornerCell());
  state.dates.forEach((date) => grid.append(createDateHeader(date)));

  times.forEach((time) => {
    grid.append(createTimeCell(time));
    state.dates.forEach((date) => {
      const availablePeople = state.participants.filter((person) => getAvailability(person.id, date, time));
      summaries.push({ date, time, people: availablePeople });
      const cell = document.createElement("div");
      const count = availablePeople.length;
      const all = count === state.participants.length;
      const some = count > 0;
      cell.className = `grid-cell summary-cell${all ? " best" : some ? " good" : ""}`;
      cell.title = availablePeople.map((person) => person.name).join(", ") || "該当者なし";
      cell.textContent = `${count}/${state.participants.length}`;
      grid.append(cell);
    });
  });

  renderBestSlots(summaries);
  els.summaryGrid.append(grid);
}

function renderBestSlots(summaries) {
  const ranked = summaries
    .filter((slot) => slot.people.length > 0)
    .sort((a, b) => b.people.length - a.people.length || a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, 5);

  if (ranked.length === 0) {
    const empty = document.createElement("div");
    empty.className = "best-slot";
    empty.textContent = "可の時間がまだありません。";
    els.bestSlots.append(empty);
    return;
  }

  ranked.forEach((slot) => {
    const item = document.createElement("div");
    item.className = "best-slot";
    const names = slot.people.map((person) => person.name || "無名").join(", ");
    item.innerHTML = `<strong>${formatDate(slot.date)} ${slot.time}</strong><span>${slot.people.length}/${state.participants.length}人: ${escapeHtml(names)}</span>`;
    els.bestSlots.append(item);
  });
}

function createGridElement() {
  const grid = document.createElement("div");
  grid.className = "schedule-grid";
  grid.style.gridTemplateColumns = `82px repeat(${state.dates.length}, minmax(142px, 1fr))`;
  return grid;
}

function createCornerCell() {
  const cell = document.createElement("div");
  cell.className = "time-cell";
  cell.textContent = "時間";
  return cell;
}

function createTimeCell(time) {
  const cell = document.createElement("div");
  cell.className = "time-cell";
  cell.textContent = time;
  return cell;
}

function createDateHeader(date) {
  const template = document.querySelector("#dateHeaderTemplate");
  const header = template.content.firstElementChild.cloneNode(true);
  header.querySelector("span").textContent = formatDate(date);
  header.querySelector("button").addEventListener("click", () => {
    state.dates = state.dates.filter((candidate) => candidate !== date);
    state.participants.forEach((person) => {
      delete state.availability[person.id]?.[date];
    });
    persist();
    render();
  });
  return header;
}

function buildTimes() {
  const slots = [];
  for (let minutes = START_HOUR * 60; minutes < END_HOUR * 60; minutes += SLOT_MINUTES) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
    const minute = String(minutes % 60).padStart(2, "0");
    slots.push(`${hour}:${minute}`);
  }
  return slots;
}

function addDates(dates) {
  const validDates = dates.filter(Boolean);
  if (validDates.length === 0) return;
  const before = state.dates.length;
  state.dates = Array.from(new Set([...state.dates, ...validDates])).sort();
  if (state.dates.length === before) return;
  ensureAvailabilityShape();
  persist();
  render();
}

function buildDateRange(startDate, endDate, excludeWeekends) {
  if (!startDate || !endDate) return [];
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (start > end) return [];

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (!excludeWeekends || (day !== 0 && day !== 6)) {
      dates.push(formatInputDate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function ensureAvailabilityShape() {
  state.participants.forEach((person) => {
    state.availability[person.id] ||= {};
    state.dates.forEach((date) => {
      state.availability[person.id][date] ||= {};
      times.forEach((time) => {
        state.availability[person.id][date][time] ??= false;
      });
    });
  });
}

function getAvailability(participantId, date, time) {
  return Boolean(state.availability[participantId]?.[date]?.[time]);
}

function setAvailability(participantId, date, time, value) {
  state.availability[participantId] ||= {};
  state.availability[participantId][date] ||= {};
  state.availability[participantId][date][time] = value;
}

function loadAppState() {
  const storedV2 = readStoredJson(STORAGE_KEY);
  if (storedV2?.meetings?.length) return normalizeAppState(storedV2);

  const legacy = readStoredJson(LEGACY_STORAGE_KEY);
  if (legacy && Array.isArray(legacy.dates) && Array.isArray(legacy.participants)) {
    const meeting = normalizeMeeting({ id: crypto.randomUUID(), ...legacy });
    return { activeMeetingId: meeting.id, meetings: [meeting] };
  }

  const meeting = createMeeting("新しい打ち合わせ");
  return { activeMeetingId: meeting.id, meetings: [meeting] };
}

function readStoredJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function normalizeAppState(value) {
  const meetings = value.meetings.map(normalizeMeeting);
  const activeMeetingId = meetings.some((meeting) => meeting.id === value.activeMeetingId) ? value.activeMeetingId : meetings[0].id;
  return { activeMeetingId, meetings };
}

function normalizeMeeting(value) {
  return {
    id: value.id || crypto.randomUUID(),
    title: value.title || "",
    dates: Array.isArray(value.dates) ? value.dates : [],
    participants: Array.isArray(value.participants) ? value.participants : [],
    availability: value.availability && typeof value.availability === "object" ? value.availability : {},
  };
}

function createMeeting(title = "") {
  return { id: crypto.randomUUID(), title, dates: [], participants: [], availability: {} };
}

function getActiveMeeting() {
  return appState.meetings.find((meeting) => meeting.id === appState.activeMeetingId) || appState.meetings[0];
}

function syncActiveMeeting() {
  if (!appState.meetings.length) {
    const meeting = createMeeting("新しい打ち合わせ");
    appState.meetings.push(meeting);
    appState.activeMeetingId = meeting.id;
  }
  state = getActiveMeeting();
  appState.activeMeetingId = state.id;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  scheduleCloudSave();
}

function setDefaultDate() {
  const today = new Date();
  const value = formatInputDate(today);
  els.dateInput.value = value;
  els.rangeStartInput.value = value;
  els.rangeEndInput.value = value;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function exportJson() {
  downloadFile(`${fileBaseName()}_all.json`, JSON.stringify(appState, null, 2), "application/json");
}

function exportCsv() {
  const rows = [["打ち合わせ名", "日付", "時間", "可の人数", "総人数", "可の参加者"]];
  state.dates.forEach((date) => {
    times.forEach((time) => {
      const people = state.participants.filter((person) => getAvailability(person.id, date, time));
      rows.push([state.title || "無題の打ち合わせ", formatDate(date), time, people.length, state.participants.length, people.map((person) => person.name).join(" / ")]);
    });
  });
  const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  downloadFile(`${fileBaseName()}.csv`, csv, "text/csv;charset=utf-8");
}
