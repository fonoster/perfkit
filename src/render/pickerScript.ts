/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * The page's only script: opens and closes the run picker. The button's
 * `aria-expanded` follows the list; opening moves focus to the first link;
 * Esc closes the list and returns focus to the button; a click outside or on
 * "See all" closes it.
 */
export const PICKER_SCRIPT = `(function () {
  var picker = document.querySelector("[data-picker]");
  if (!picker) return;
  var button = picker.querySelector("button");
  var panel = picker.querySelector(".picker-panel");
  function setOpen(open, returnFocus) {
    button.setAttribute("aria-expanded", open ? "true" : "false");
    panel.hidden = !open;
    if (open) {
      var first = panel.querySelector("a");
      if (first) first.focus();
    } else if (returnFocus) {
      button.focus();
    }
  }
  button.addEventListener("click", function () {
    setOpen(button.getAttribute("aria-expanded") !== "true", false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !panel.hidden) setOpen(false, true);
  });
  document.addEventListener("click", function (event) {
    if (!panel.hidden && !picker.contains(event.target)) setOpen(false, false);
  });
  panel.addEventListener("click", function (event) {
    var link = event.target.closest("a");
    if (link && link.getAttribute("href") === "#all-runs") setOpen(false, false);
  });
})();`;
