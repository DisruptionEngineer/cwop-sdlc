/**
 * Crew Chief Virtual Keyboard
 * Touch-optimized on-screen keyboard for Pi 5 + Touch Display 2 (1280×720).
 * Auto-attaches to all <input> elements. Shows QWERTY for text, numpad for numbers.
 */

// ── Layouts ─────────────────────────────────────────────

const QWERTY = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["⇧", "z", "x", "c", "v", "b", "n", "m", "⌫"],
];

const QWERTY_BOTTOM = [
  { key: "123", label: "123", cls: "vk-key--fn" },
  { key: " ", label: "SPACE", cls: "vk-key--space" },
  { key: "done", label: "DONE", cls: "vk-key--done" },
];

const NUMPAD = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "⌫"],
];

const NUMPAD_SYMBOLS = [
  ["-", "/", "#"],
  ["(", ")", "&"],
  ["@", ":", ";"],
  [".", ",", "⌫"],
];

const NUM_BOTTOM = [
  { key: "abc", label: "ABC", cls: "vk-key--fn" },
  { key: "done", label: "DONE", cls: "vk-key--done" },
];

// ── State ───────────────────────────────────────────────

let activeInput = null;
let shifted = false;
let capsLock = false;
let currentLayout = "qwerty"; // "qwerty" | "numpad"
let keyboardMode = "text";    // "text" | "number"
let container = null;
let overlay = null;

// ── Build DOM ───────────────────────────────────────────

function createKeyboard() {
  // Overlay behind keyboard to catch taps
  overlay = document.createElement("div");
  overlay.className = "vk-overlay";
  overlay.addEventListener("touchstart", (e) => {
    e.preventDefault();
    hide();
  });
  overlay.addEventListener("mousedown", (e) => {
    e.preventDefault();
    hide();
  });

  // Keyboard container
  container = document.createElement("div");
  container.className = "vk-keyboard";
  container.addEventListener("touchstart", (e) => e.stopPropagation());
  container.addEventListener("mousedown", (e) => e.stopPropagation());

  document.body.appendChild(overlay);
  document.body.appendChild(container);
}

function renderKeys() {
  container.innerHTML = "";
  container.className = "vk-keyboard" + (currentLayout === "numpad" ? " vk-keyboard--numpad" : "");

  if (currentLayout === "qwerty") {
    renderQwerty();
  } else {
    renderNumpad();
  }
}

function renderQwerty() {
  for (let r = 0; r < QWERTY.length; r++) {
    const row = document.createElement("div");
    row.className = "vk-row";
    if (r === 1) row.classList.add("vk-row--offset");

    for (const key of QWERTY[r]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vk-key";

      if (key === "⇧") {
        btn.classList.add("vk-key--shift");
        if (shifted || capsLock) btn.classList.add("vk-key--active");
        btn.textContent = "⇧";
      } else if (key === "⌫") {
        btn.classList.add("vk-key--backspace");
        btn.textContent = "⌫";
      } else {
        const display = (shifted || capsLock) ? key.toUpperCase() : key;
        btn.textContent = display;
        btn.dataset.char = display;
      }

      btn.dataset.key = key;
      btn.addEventListener("touchstart", handleKeyTouch);
      btn.addEventListener("mousedown", handleKeyMouse);
      row.appendChild(btn);
    }
    container.appendChild(row);
  }

  // Bottom row
  const bottomRow = document.createElement("div");
  bottomRow.className = "vk-row vk-row--bottom";
  for (const item of QWERTY_BOTTOM) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vk-key " + item.cls;
    btn.textContent = item.label;
    btn.dataset.key = item.key;
    btn.addEventListener("touchstart", handleKeyTouch);
    btn.addEventListener("mousedown", handleKeyMouse);
    bottomRow.appendChild(btn);
  }
  container.appendChild(bottomRow);
}

function renderNumpad() {
  const keys = NUMPAD;
  for (let r = 0; r < keys.length; r++) {
    const row = document.createElement("div");
    row.className = "vk-row vk-row--numpad";
    for (const key of keys[r]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vk-key vk-key--num";
      if (key === "⌫") {
        btn.classList.add("vk-key--backspace");
      }
      btn.textContent = key;
      btn.dataset.key = key;
      btn.addEventListener("touchstart", handleKeyTouch);
      btn.addEventListener("mousedown", handleKeyMouse);
      row.appendChild(btn);
    }
    container.appendChild(row);
  }

  // Bottom row
  const bottomRow = document.createElement("div");
  bottomRow.className = "vk-row vk-row--bottom vk-row--numpad";
  for (const item of NUM_BOTTOM) {
    // Only show ABC button if we came from a text field
    if (item.key === "abc" && keyboardMode === "number") continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vk-key " + item.cls;
    btn.textContent = item.label;
    btn.dataset.key = item.key;
    btn.addEventListener("touchstart", handleKeyTouch);
    btn.addEventListener("mousedown", handleKeyMouse);
    bottomRow.appendChild(btn);
  }
  container.appendChild(bottomRow);
}

// ── Key Handlers ────────────────────────────────────────

function handleKeyTouch(e) {
  e.preventDefault();
  e.stopPropagation();
  processKey(e.currentTarget.dataset.key);
}

function handleKeyMouse(e) {
  e.preventDefault();
  e.stopPropagation();
  processKey(e.currentTarget.dataset.key);
}

function processKey(key) {
  if (!activeInput) return;

  switch (key) {
    case "done":
      hide();
      return;

    case "⇧":
      if (shifted && !capsLock) {
        // Already shifted once → caps lock
        capsLock = true;
        shifted = true;
      } else if (capsLock) {
        // Caps lock on → turn off
        capsLock = false;
        shifted = false;
      } else {
        // Not shifted → shift once
        shifted = true;
      }
      renderKeys();
      return;

    case "⌫":
      backspace();
      return;

    case "123":
      currentLayout = "numpad";
      renderKeys();
      return;

    case "abc":
      currentLayout = "qwerty";
      renderKeys();
      return;

    case " ":
      insertChar(" ");
      return;

    default: {
      const char = (shifted || capsLock) ? key.toUpperCase() : key;
      insertChar(char);
      // Auto-unshift after one character (unless caps locked)
      if (shifted && !capsLock) {
        shifted = false;
        renderKeys();
      }
      return;
    }
  }
}

function insertChar(char) {
  if (!activeInput) return;
  const start = activeInput.selectionStart ?? activeInput.value.length;
  const end = activeInput.selectionEnd ?? activeInput.value.length;
  const val = activeInput.value;
  activeInput.value = val.slice(0, start) + char + val.slice(end);
  const newPos = start + char.length;
  activeInput.setSelectionRange(newPos, newPos);
  activeInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function backspace() {
  if (!activeInput) return;
  const start = activeInput.selectionStart ?? activeInput.value.length;
  const end = activeInput.selectionEnd ?? activeInput.value.length;
  const val = activeInput.value;

  if (start !== end) {
    // Delete selection
    activeInput.value = val.slice(0, start) + val.slice(end);
    activeInput.setSelectionRange(start, start);
  } else if (start > 0) {
    // Delete one character before cursor
    activeInput.value = val.slice(0, start - 1) + val.slice(start);
    activeInput.setSelectionRange(start - 1, start - 1);
  }
  activeInput.dispatchEvent(new Event("input", { bubbles: true }));
}

// ── Show / Hide ─────────────────────────────────────────

function show(input) {
  activeInput = input;
  input.classList.add("vk-input-active");

  // Pick layout based on input type
  const type = input.type || "text";
  if (type === "number") {
    currentLayout = "numpad";
    keyboardMode = "number";
  } else {
    currentLayout = "qwerty";
    keyboardMode = "text";
  }

  shifted = false;
  capsLock = false;
  renderKeys();

  overlay.classList.add("vk-visible");
  container.classList.add("vk-visible");
  document.body.classList.add("vk-open");

  // Scroll input into view above keyboard
  requestAnimationFrame(() => {
    const rect = input.getBoundingClientRect();
    const kbHeight = container.offsetHeight;
    const viewportH = window.innerHeight;
    const visibleBottom = viewportH - kbHeight - 12;

    if (rect.bottom > visibleBottom) {
      const scrollBy = rect.bottom - visibleBottom + 20;
      const mainContent = document.querySelector(".main-content");
      if (mainContent) {
        mainContent.scrollBy({ top: scrollBy, behavior: "smooth" });
      } else {
        window.scrollBy({ top: scrollBy, behavior: "smooth" });
      }
    }
  });
}

function hide() {
  if (activeInput) {
    activeInput.classList.remove("vk-input-active");
    activeInput.blur();
    activeInput = null;
  }
  overlay.classList.remove("vk-visible");
  container.classList.remove("vk-visible");
  document.body.classList.remove("vk-open");
}

// ── Auto-attach ─────────────────────────────────────────

function attachToInputs() {
  const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])');

  inputs.forEach((input) => {
    // Skip if already attached
    if (input.dataset.vkAttached) return;
    input.dataset.vkAttached = "1";

    // Prevent native keyboard from opening on mobile
    input.setAttribute("inputmode", "none");

    input.addEventListener("focus", (e) => {
      // Small delay to let any blur complete first
      setTimeout(() => show(input), 50);
    });

    // Prevent default touch behavior that might dismiss
    input.addEventListener("touchstart", (e) => {
      if (activeInput === input) {
        e.stopPropagation();
      }
    });
  });
}

// ── Init ────────────────────────────────────────────────

function init() {
  createKeyboard();
  attachToInputs();

  // Re-attach when DOM changes (e.g., panel toggling shows new inputs)
  const observer = new MutationObserver(() => attachToInputs());
  observer.observe(document.body, { childList: true, subtree: true });
}

// Boot when DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
