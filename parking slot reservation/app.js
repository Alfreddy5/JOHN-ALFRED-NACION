// 1. Paste your Supabase details (Project Settings > API)
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_KEY = "YOUR_SUPABASE_ANON_KEY";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Change these labels to match your parking lot
const ROW_A = ["A1", "A2", "A3", "A4", "A5", "A6"];
const ROW_B = ["B1", "B2", "B3", "B4", "B5", "B6"];

const $ = (id) => document.getElementById(id);
let bookings = [];
let chosenSlot = null;

$("date").value = new Date().toLocaleDateString("en-CA"); // today, YYYY-MM-DD
$("date").min = $("date").value;

const hhmm = (t) => t.slice(0, 5);

// Saved user info (kept in this browser only)
function getUser() {
  try { return JSON.parse(localStorage.getItem("parkingUser")) || {}; } catch { return {}; }
}
function saveUser(u) {
  try { localStorage.setItem("parkingUser", JSON.stringify(u)); return true; } catch { return false; }
}

function toast(msg, isError = false) {
  const el = $("toast");
  el.textContent = msg;
  el.className = "show" + (isError ? " error" : "");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.className = ""), 3500);
}

function windowIsValid() {
  return $("date").value && $("from").value && $("to").value && $("to").value > $("from").value;
}

// Load bookings for the chosen date, then redraw the lot
async function refresh() {
  if (!windowIsValid()) return draw();
  const { data, error } = await db.from("reservations").select("*").eq("date", $("date").value);
  if (error) return toast("Could not load bookings. Check your Supabase keys.", true);
  bookings = data;
  draw();
}

function takenBy(slot) {
  const from = $("from").value, to = $("to").value;
  return bookings.find((b) => b.slot === slot && hhmm(b.start_time) < to && hhmm(b.end_time) > from);
}

const CAR_COLORS = ["#8fa7bd", "#e4e7eb", "#d98b6a", "#7fae9a", "#b7a5d0", "#e0c46a"];
const carSvg = (slot) => {
  const color = CAR_COLORS[[...slot].reduce((n, c) => n + c.charCodeAt(0), 0) % CAR_COLORS.length];
  return `<svg class="car" viewBox="0 0 40 72" aria-hidden="true" style="color:${color}">
    <rect x="2" y="2" width="36" height="68" rx="14" fill="currentColor"/>
    <rect x="8" y="14" width="24" height="13" rx="4" fill="rgba(0,0,0,.4)"/>
    <rect x="9" y="46" width="22" height="9" rx="3" fill="rgba(0,0,0,.4)"/></svg>`;
};

function draw() {
  const valid = windowIsValid();
  let free = 0;
  for (const [rowId, slots] of [["rowA", ROW_A], ["rowB", ROW_B]]) {
    const row = $(rowId);
    row.replaceChildren();
    slots.forEach((slot) => {
      const b = valid && takenBy(slot);
      const btn = document.createElement("button");
      btn.className = "slot " + (b ? "taken" : "free");
      btn.disabled = !valid || !!b;
      btn.setAttribute("aria-label", `Slot ${slot}, ${b ? "taken" : "free"}`);
      if (valid && !b) free++;
      btn.innerHTML = b
        ? `<b>${slot}</b>${carSvg(slot)}<small>Taken</small>`
        : `<b>${slot}</b><small>Free</small>`;
      btn.onclick = () => openForm(slot);
      row.append(btn);
    });
  }
  const total = ROW_A.length + ROW_B.length;
  $("avail").textContent = valid ? `${free} of ${total} bays free` : "Choose a valid time window";
  $("avail").classList.toggle("low", valid && free <= 2);
}

function openForm(slot) {
  chosenSlot = slot;
  $("dlgSlot").textContent = slot;
  $("dlgWhen").textContent = `${$("date").value}, ${$("from").value} to ${$("to").value}`;
  const u = getUser();
  $("name").value = u.name || "";
  $("plate").value = u.plate || "";
  $("phone").value = u.phone || "";
  $("dlg").showModal();
  $("name").focus();
}

$("cancel").onclick = () => $("dlg").close();

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await db.from("reservations").insert({
    slot: chosenSlot,
    name: $("name").value.trim(),
    plate: $("plate").value.trim().toUpperCase(),
    phone: $("phone").value.trim() || null,
    date: $("date").value,
    start_time: $("from").value,
    end_time: $("to").value,
  });
  $("dlg").close();
  if (error) {
    toast(error.code === "23P01" ? "Someone just booked that slot. Pick another one." : "Booking failed. Try again.", true);
  } else {
    toast(`Slot ${chosenSlot} reserved. Find it under My bookings.`);
    $("form").reset();
  }
  refresh();
});

// Find and cancel bookings by plate number
async function findMine() {
  const plate = $("findPlate").value.trim().toUpperCase();
  if (!plate) return;
  const today = new Date().toLocaleDateString("en-CA");
  const { data, error } = await db.from("reservations").select("*")
    .eq("plate", plate).gte("date", today).order("date").order("start_time");
  const list = $("myList");
  list.replaceChildren();
  if (error) return toast("Could not search bookings.", true);
  if (!data.length) {
    list.innerHTML = '<li class="empty">No upcoming bookings for that plate.</li>';
    return;
  }
  data.forEach((b) => {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = `Slot ${b.slot} · ${b.date} · ${hhmm(b.start_time)} to ${hhmm(b.end_time)}`;
    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "Cancel booking";
    del.onclick = async () => {
      const { error } = await db.from("reservations").delete().eq("id", b.id);
      if (error) return toast("Could not cancel. Try again.", true);
      toast("Booking cancelled.");
      findMine();
      refresh();
    };
    li.append(text, del);
    list.append(li);
  });
}
$("findBtn").onclick = findMine;
$("findPlate").addEventListener("keydown", (e) => e.key === "Enter" && findMine());

["date", "from", "to"].forEach((id) => $(id).addEventListener("change", refresh));
refresh();

// My info page
function fillInfo() {
  const u = getUser();
  $("uName").value = u.name || "";
  $("uPlate").value = u.plate || "";
  $("uPhone").value = u.phone || "";
  $("hello").textContent = u.name ? `Welcome back, ${u.name}.` : "";
}
$("infoForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const ok = saveUser({
    name: $("uName").value.trim(),
    plate: $("uPlate").value.trim().toUpperCase(),
    phone: $("uPhone").value.trim(),
  });
  toast(ok ? "Your info is saved." : "Could not save. Check your browser settings.", !ok);
  fillInfo();
});
$("clearInfo").onclick = () => {
  try { localStorage.removeItem("parkingUser"); } catch {}
  fillInfo();
  toast("Your info is cleared.");
};

// Navigation: one page shown at a time, driven by the URL hash
const PAGES = ["reserve", "bookings", "info"];
function showPage() {
  const page = PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : "reserve";
  PAGES.forEach((id) => ($("page-" + id).hidden = id !== page));
  document.querySelectorAll(".bar a[href^='#']:not(.brand)").forEach((a) =>
    a.setAttribute("aria-current", a.hash === "#" + page ? "page" : "false"));
  if (page === "bookings" && getUser().plate && !$("findPlate").value) {
    $("findPlate").value = getUser().plate;
  }
  if (page === "bookings" && $("findPlate").value) findMine();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", showPage);
fillInfo();
showPage();
