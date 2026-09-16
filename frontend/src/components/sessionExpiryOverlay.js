import { BACKEND_API_URL } from "../views/map.js";
import { identifiers } from "../utils/identifiers.js";

const ACTIVITY_KEY = "syntro-admin-last-activity";
const ACTIVITY_THROTTLE_MS = 4000;
const KEEP_ALIVE_MIN_INTERVAL_MS = 120000;
const DEFAULTS = { idleMinutes: 15, warningMinutes: 14 };

let idleMs = DEFAULTS.idleMinutes * 60 * 1000;
let warningMs = DEFAULTS.warningMinutes * 60 * 1000;
let isAuthenticated = false;
let lastActivityAt = Date.now();
let lastActivityWrite = 0;
let lastKeepAliveAt = 0;
let tickHandle = null;
let overlays = null;

const getLastActivity = () => {
  try {
    const value = Number.parseInt(localStorage.getItem(ACTIVITY_KEY) || "", 10);
    return Number.isFinite(value) && value > 0 ? value : lastActivityAt;
  } catch {
    return lastActivityAt;
  }
};

const writeActivity = (now) => {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(now));
  } catch {
    // Sin storage disponible no bloqueamos la sesion local.
  }
};

const keepAlive = async () => {
  if (!isAuthenticated) return;
  const now = Date.now();
  if (now - lastKeepAliveAt < KEEP_ALIVE_MIN_INTERVAL_MS) return;
  lastKeepAliveAt = now;
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/keep-alive`, {
      credentials: "include",
      cache: "no-store",
    });
    if (response.status === 401) {
      window.dispatchEvent(
        new CustomEvent(identifiers.events.sessionChanged, { detail: { isAuthenticated: false } })
      );
    }
  } catch {
    // Sin respuesta del backend: la proxima actividad vuelve a intentar.
  }
};

const markActivity = (now) => {
  if (now - lastActivityWrite < ACTIVITY_THROTTLE_MS) return;
  lastActivityWrite = now;
  lastActivityAt = now;
  writeActivity(now);
  void keepAlive();
};

const showWarning = () => {
  if (!overlays) return;
  overlays.querySelector("#session-warning-overlay")?.classList.add("is-open");
  document.body.classList.add("session-warning-open");
};

const hideWarning = () => {
  if (!overlays) return;
  overlays.querySelector("#session-warning-overlay")?.classList.remove("is-open");
  document.body.classList.remove("session-warning-open");
};

const showExpired = () => {
  if (!overlays) return;
  overlays.querySelector("#session-expired-overlay")?.classList.add("is-open");
};

const updateCountdown = (remainingMs) => {
  const countdown = overlays?.querySelector("#session-warning-countdown");
  if (!countdown) return;
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  countdown.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const expireSession = () => {
  lastActivityAt = 0;
  writeActivity(0);
  hideWarning();
  showExpired();
  window.dispatchEvent(
    new CustomEvent(identifiers.events.sessionChanged, { detail: { isAuthenticated: false } })
  );
  if (tickHandle) {
    window.clearInterval(tickHandle);
    tickHandle = null;
  }
};

const tick = () => {
  const now = Date.now();
  const lastActivity = getLastActivity();
  const idle = Math.max(0, now - lastActivity);

  if (!isAuthenticated) {
    hideWarning();
    return;
  }

  if (idle >= idleMs) {
    expireSession();
    return;
  }

  if (idle >= warningMs) {
    updateCountdown(idleMs - idle);
    showWarning();
    return;
  }

  hideWarning();
};

const goToLoginPage = () => {
  window.location.href = `${BACKEND_API_URL}/Auth/Login`;
};

const bindActivityEvents = () => {
  const activityEvents = ["click", "keydown", "mousemove", "scroll", "touchstart"];
  const handler = () => markActivity(Date.now());
  for (const type of activityEvents) {
    window.addEventListener(type, handler, { passive: true });
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== ACTIVITY_KEY) return;
    const value = Number.parseInt(event.newValue || "", 10);
    if (!Number.isFinite(value) || value <= 0) return;
    lastActivityAt = value;
    lastActivityWrite = value;
    hideWarning();
  });
};

const ensureOverlays = () => {
  if (overlays) return;
  overlays = document.createElement("div");
  overlays.id = "session-expiry-overlays";
  overlays.innerHTML = `
    <div id="session-warning-overlay" class="session-warning-overlay" aria-hidden="true">
      <div class="session-warning-card" role="dialog" aria-modal="true" aria-labelledby="session-warning-title">
        <h5 id="session-warning-title">Sesion por caducar</h5>
        <p class="session-expiry-text">Tu sesion esta a punto de expirar por inactividad.</p>
        <div class="session-countdown">Quedan <span id="session-warning-countdown">00:00</span> min.</div>
        <button type="button" id="session-keep-alive">Seguir conectado</button>
      </div>
    </div>
    <div id="session-expired-overlay" class="session-expired-overlay" aria-hidden="true">
      <div class="session-expired-card" role="dialog" aria-modal="true">
        <h5>Sesion caducada</h5>
        <p class="session-expiry-text">Tu sesion expiro por inactividad.</p>
        <button type="button" id="session-reconnect">Volver a conectarse</button>
      </div>
    </div>
  `;
  overlays.querySelector("#session-keep-alive")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    lastKeepAliveAt = 0;
    lastActivityAt = Date.now();
    writeActivity(lastActivityAt);
    lastActivityWrite = lastActivityAt;
    void keepAlive();
    hideWarning();
  });
  overlays.querySelector("#session-reconnect")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    goToLoginPage();
  });
  document.body.appendChild(overlays);
};

const loadSessionSettings = async () => {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/session`, {
      credentials: "include",
      cache: "no-store",
    });
    const session = response.ok ? await response.json() : {};
    isAuthenticated = Boolean(session?.isAuthenticated);
    if (Number.isFinite(session?.idleMinutes) && session.idleMinutes > 0) {
      idleMs = session.idleMinutes * 60 * 1000;
    }
    if (Number.isFinite(session?.warningMinutes) && session.warningMinutes > 0) {
      warningMs = session.warningMinutes * 60 * 1000;
    }
  } catch {
    isAuthenticated = false;
  }
};

export const initSessionExpiryOverlay = async () => {
  await loadSessionSettings();
  ensureOverlays();
  bindActivityEvents();
  window.addEventListener(identifiers.events.sessionChanged, (event) => {
    const detail = event.detail || {};
    if (detail?.isAuthenticated === true) {
      isAuthenticated = true;
      document.body.classList.remove("session-warning-open");
      overlays?.querySelector("#session-expired-overlay")?.classList.remove("is-open");
    } else if (detail?.isAuthenticated === false) {
      isAuthenticated = false;
    }
  });
  if (!tickHandle) {
    tickHandle = window.setInterval(tick, 1000);
  }
};