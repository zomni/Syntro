import { appConfig } from "../config/appConfig.js";

let sessionPromise = null;

export const loadSession = ({ forceRefresh = false } = {}) => {
  if (sessionPromise && !forceRefresh) {
    return sessionPromise;
  }

  sessionPromise = fetch(`${appConfig.apiBaseUrl}/api/auth/session`, {
    credentials: "include",
    cache: "no-store",
  })
    .then(async (response) => (response.ok ? response.json() : null))
    .catch(() => null);

  return sessionPromise;
};

export const resetSessionCache = () => {
  sessionPromise = null;
};
