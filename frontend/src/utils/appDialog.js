const escapeHtml = (value) => {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};

const createDialog = (options) => {
  const backdrop = document.createElement("div");
  backdrop.className = "manual-building-modal-backdrop app-dialog-backdrop";

  const modal = document.createElement("div");
  modal.className = "manual-building-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", options.title || "");

  const header = document.createElement("div");
  header.className = "manual-building-modal-header";
  const title = document.createElement("div");
  title.className = "manual-building-modal-title";
  title.textContent = options.title || "";
  header.appendChild(title);
  modal.appendChild(header);

  const body = document.createElement("div");
  body.className = "app-dialog-body";
  body.textContent = options.message || "";
  modal.appendChild(body);

  let input = null;
  if (options.input) {
    input = document.createElement("input");
    input.className = "app-dialog-input";
    input.value = options.defaultValue || "";
    modal.appendChild(input);
  }

  const actions = document.createElement("div");
  actions.className = "manual-building-modal-actions";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "manual-building-secondary";
  cancel.textContent = options.cancelLabel || "Cancelar";

  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "manual-building-primary";
  confirm.textContent = options.confirmLabel || "Confirmar";

  actions.appendChild(cancel);
  actions.appendChild(confirm);
  modal.appendChild(actions);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  return { backdrop, modal, cancel, confirm, input };
};

export const appAlert = (message, title = "Aviso") => {
  return new Promise((resolve) => {
    const { backdrop, modal, cancel, confirm } = createDialog({ title, message, confirmLabel: "Aceptar" });
    cancel.style.display = "none";
    const close = () => {
      backdrop.remove();
      window.removeEventListener("keydown", escapeHandler);
      resolve();
    };
    const escapeHandler = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", escapeHandler);
    confirm.addEventListener("click", close);
    modal.addEventListener("click", (event) => event.stopPropagation());
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) close();
    });
    confirm.focus();
  });
};

export const appConfirm = (message, { title = "Confirmar", confirmLabel = "Confirmar", cancelLabel = "Cancelar" } = {}) => {
  return new Promise((resolve) => {
    const { backdrop, modal, cancel, confirm } = createDialog({ title, message, confirmLabel, cancelLabel });
    const close = (result) => {
      backdrop.remove();
      window.removeEventListener("keydown", escapeHandler);
      resolve(result);
    };
    const escapeHandler = (event) => {
      if (event.key === "Escape") close(false);
    };
    window.addEventListener("keydown", escapeHandler);
    confirm.addEventListener("click", () => close(true));
    cancel.addEventListener("click", () => close(false));
    modal.addEventListener("click", (event) => event.stopPropagation());
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) close(false);
    });
    confirm.focus();
  });
};

export const appPrompt = (message, defaultValue = "") => {
  return new Promise((resolve) => {
    const { backdrop, modal, cancel, confirm, input } = createDialog({
      title: "Entrada",
      message,
      confirmLabel: "Aceptar",
      input: true,
      defaultValue,
    });
    const close = (result) => {
      backdrop.remove();
      window.removeEventListener("keydown", escapeHandler);
      resolve(result);
    };
    const escapeHandler = (event) => {
      if (event.key === "Escape") close(null);
    };
    window.addEventListener("keydown", escapeHandler);
    confirm.addEventListener("click", () => close(input.value));
    cancel.addEventListener("click", () => close(null));
    modal.addEventListener("click", (event) => event.stopPropagation());
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) close(null);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        close(input.value);
      }
    });
    input.focus();
    input.select();
  });
};