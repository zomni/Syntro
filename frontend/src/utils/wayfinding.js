const BODY_CLASS = "map-ui-wayfinding";

let wayfindingActive = false;
let wayfindingMedia = null;

const evaluate = () => {
  const next = Boolean(wayfindingMedia?.matches);
  if (next === wayfindingActive) return;
  wayfindingActive = next;
  document.body.classList.toggle(BODY_CLASS, next);
  window.dispatchEvent(new CustomEvent("syntro-wayfinding-changed", { detail: { active: next } }));
};

export const isWayfindingMode = () => wayfindingActive;

export const initWayfindingMode = () => {
  if (typeof window.matchMedia !== "function") return;
  wayfindingMedia = window.matchMedia("(pointer: coarse), (hover: none), (max-width: 767px)");
  if (typeof wayfindingMedia.addEventListener === "function") {
    wayfindingMedia.addEventListener("change", evaluate);
  } else if (typeof wayfindingMedia.addListener === "function") {
    wayfindingMedia.addListener(evaluate);
  }
  evaluate();
};