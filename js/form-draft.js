const DRAFT_STORAGE_KEY = "one_stop_renew_form_draft_v2";
const DRAFT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const PRICING_FIELD_KEYS = new Set(["duration", "branches", "compound", "info", "colored"]);
const PAYMENT_FIELD_KEYS = new Set(["paymentCategory", "paymentBank", "paymentWallet", "paymentCardController"]);

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function shouldSkipField(element) {
  const type = String(element.type || "").toLowerCase();
  const autocomplete = String(element.autocomplete || "").toLowerCase();
  const name = String(element.name || element.id || "").toLowerCase();

  if (!element.name && !element.id) return true;
  if (PAYMENT_FIELD_KEYS.has(String(element.name || element.id || ""))) return true;
  if (element.disabled && !element.readOnly) return true;
  if (["password", "file", "hidden", "submit", "button", "image"].includes(type)) return true;
  if (autocomplete.startsWith("cc-")) return true;
  if (/card|cc_|cc-|cvc|cvv|security.?code/.test(name)) return true;

  return false;
}

function fieldKey(element) {
  return element.id || element.name;
}

function collectDraftValues(form) {
  const values = {};

  form.querySelectorAll("input, select, textarea").forEach((element) => {
    if (shouldSkipField(element)) return;

    const key = fieldKey(element);
    const type = String(element.type || "").toLowerCase();

    if (type === "checkbox") {
      values[key] = element.checked;
      return;
    }

    if (type === "radio") {
      if (element.checked) values[key] = element.value;
      return;
    }

    values[key] = element.value;
  });

  return values;
}

function resetPaymentSelection(form) {
  if (!form) return;

  form.querySelectorAll('[name="paymentCategory"]').forEach((radio) => {
    radio.checked = false;
  });

  const bank = form.querySelector('[name="paymentBank"]');
  if (bank) bank.value = "";

  form.querySelectorAll('[name="paymentWallet"]').forEach((radio) => {
    radio.checked = false;
  });

  form.querySelectorAll('[name="paymentCardController"]').forEach((radio) => {
    radio.checked = false;
  });
}

function applyDraftValues(form, values) {
  Object.entries(values).forEach(([key, savedValue]) => {
    const element = form.querySelector(`#${CSS.escape(key)}`) || form.querySelector(`[name="${key}"]`);
    if (!element) return;

    const type = String(element.type || "").toLowerCase();

    if (type === "checkbox") {
      element.checked = Boolean(savedValue);
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (type === "radio") {
      const group = form.querySelectorAll(`[name="${key}"]`);
      group.forEach((radio) => {
        radio.checked = radio.value == savedValue;
      });
      group[0]?.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    element.value = savedValue ?? "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function saveRenewalDraft(form) {
  if (!form) return;

  const payload = {
    savedAt: Date.now(),
    values: collectDraftValues(form),
    meta: {
      lookupValidated: Boolean(form.querySelector("#business-name")?.value.trim()),
      paymentTestMode: window.__paymentTestMode ?? null,
    },
  };

  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
}

function filterDraftValues(values, savedTestMode) {
  const currentTestMode = window.__paymentTestMode;
  const safeValues = Object.fromEntries(
    Object.entries(values).filter(([key]) => !PAYMENT_FIELD_KEYS.has(key))
  );

  if (
    savedTestMode !== undefined &&
    currentTestMode !== undefined &&
    savedTestMode !== currentTestMode
  ) {
    return Object.fromEntries(
      Object.entries(safeValues).filter(([key]) => !PRICING_FIELD_KEYS.has(key))
    );
  }
  return safeValues;
}

function restoreRenewalDraft(form) {
  if (!form) return null;

  const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) return null;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return null;
  }

  if (!payload?.savedAt || Date.now() - payload.savedAt > DRAFT_TTL_MS) {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return null;
  }

  const values = filterDraftValues(payload.values || {}, payload.meta?.paymentTestMode);
  resetPaymentSelection(form);
  applyDraftValues(form, values);
  return {
    ...(payload.meta || {}),
    pricingModeChanged:
      payload.meta?.paymentTestMode !== undefined &&
      window.__paymentTestMode !== undefined &&
      payload.meta.paymentTestMode !== window.__paymentTestMode,
  };
}

function clearRenewalDraft() {
  localStorage.removeItem("one_stop_renew_form_draft_v1");
  localStorage.removeItem(DRAFT_STORAGE_KEY);
}

window.RenewalFormDraft = {
  save: () => {
    const form = document.querySelector(".renewal-form");
    saveRenewalDraft(form);
  },
  restore: () => {
    const form = document.querySelector(".renewal-form");
    return restoreRenewalDraft(form);
  },
  clear: clearRenewalDraft,
};

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".renewal-form");
  if (!form) return;

  const restoreDraft = () => {
    resetPaymentSelection(form);
    const meta = restoreRenewalDraft(form);
    document.dispatchEvent(
      new CustomEvent("renewal-draft-restored", {
        detail: meta || {},
      })
    );
  };

  if (window.__pricingConfigReady) {
    restoreDraft();
  } else {
    document.addEventListener("pricing-config-ready", restoreDraft, { once: true });
  }

  const debouncedSave = debounce(() => saveRenewalDraft(form), 250);
  form.addEventListener("input", debouncedSave);
  form.addEventListener("change", debouncedSave);
  window.addEventListener("beforeunload", () => saveRenewalDraft(form));

  window.addEventListener("pageshow", (event) => {
    resetPaymentSelection(form);
    if (!event.persisted) return;
    restoreDraft();
  });
});
