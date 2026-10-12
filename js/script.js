const renewalForm = document.querySelector('.renewal-form');
const duration = document.querySelector('#duration');
const branches = document.querySelector('#branches');
const total = document.querySelector('#total');
const renewalFee = document.querySelector('#renewal-fee');
const branchFeeRow = document.querySelector('#branch-fee-row');
const branchFeeAmount = document.querySelector('#branch-fee');
const addonFeeRow = document.querySelector('#addon-fee-row');
const addonFeeAmount = document.querySelector('#addon-fee');
const addOns = ['compound', 'info', 'colored'].map((key) => document.querySelector(`#${key}`));
const compoundHint = document.querySelector('#compound-hint');
const infoHint = document.querySelector('#info-hint');
const registrationInput = document.querySelector('#registration');
const businessNameInput = document.querySelector('#business-name');
const oldRegistrationInput = document.querySelector('#old-registration');
const registrationStatus = document.querySelector('#registration-status');
const verificationMarkerInput = document.querySelector('#ssm-verification-marker');
const verificationCard = document.querySelector('#ssm-verification-card');
const businessNameFieldWrapper = document.querySelector('.ssm-business-name-field');
const oldRegistrationFieldWrapper = document.querySelector('.ssm-old-registration-field');
let payButton = renewalForm?.querySelector('.form-submit');
const PAY_BUTTON_LABEL = payButton?.textContent?.trim() || 'Pay Now';
const FORM_ID = Math.max(1, Number(renewalForm?.dataset?.formId || 1));
const PAYMENT_GATEWAY = String(renewalForm?.dataset?.paymentGateway || 'billplz').toLowerCase();
const FIUU_CHECKOUT_EXPERIENCE = String(renewalForm?.dataset?.fiuuCheckoutExperience || 'hosted').toLowerCase();
const IS_FIUU_PREPARED = PAYMENT_GATEWAY === 'fiuu' && FIUU_CHECKOUT_EXPERIENCE === 'prepared_seamless';
const PAYMENT_GATEWAY_LABEL = PAYMENT_GATEWAY === 'fiuu' ? 'Fiuu' : (PAYMENT_GATEWAY === 'razorpay' ? 'Razorpay' : (PAYMENT_GATEWAY === 'billplz' ? 'Billplz' : 'Payment'));
const PAYMENT_REDIRECT_TEXT = PAYMENT_GATEWAY === 'none' ? 'Submitting...' : `Redirecting to ${PAYMENT_GATEWAY_LABEL}...`;
const paymentMethodSection = renewalForm?.querySelector('.osr-payment-methods');
const paymentCategoryInputs = renewalForm?.querySelectorAll('input[name="paymentCategory"]') || [];
const paymentBank = renewalForm?.elements?.namedItem('paymentBank') || null;
const paymentWalletInputs = renewalForm?.querySelectorAll('input[name="paymentWallet"]') || [];
const bankOptions = renewalForm?.querySelector('.osr-bank-options');
const businessBankOptions = renewalForm?.querySelector('.osr-business-bank-options');
const ewalletOptions = renewalForm?.querySelector('.osr-ewallet-options');
const paymentPickers = renewalForm?.querySelectorAll('[data-payment-picker]') || [];
const paymentWalletFieldset = renewalForm?.querySelector('.osr-payment-native-wallets');
const paymentMethodStatus = renewalForm?.querySelector('.osr-payment-method-status');
const paymentMethodError = renewalForm?.querySelector('.osr-payment-method-error');
const formSubmitError = renewalForm?.querySelector('.osr-form-submit-error');
const cardInpage = renewalForm?.querySelector('[data-card-inpage]');
const cardInpageStatus = renewalForm?.querySelector('[data-card-inpage-status]');
const cardFrame = renewalForm?.querySelector('#MOLPAYCC');
const cardInpageController = renewalForm?.querySelector('.osr-fiuu-inpage-controller');
let cardInpageFallback = renewalForm?.querySelector('[data-card-inpage-fallback]');
const CARD_USES_INPAGE = Boolean(cardInpage && cardFrame && cardInpageController);
let inpageObserver = null;
let inpageTimer = null;
const INPAGE_IFRAME_TIMEOUT_MS = 6500;
let preparationRevision = 0;
let preparedRevision = 0;
let preparationTimer = null;
let preparationAbortController = null;
let preparedSeamlessOptions = null;
let preparedFingerprint = '';
let preparedRecordId = '';
let preparedToken = '';
let preparedStartSent = false;
const PREPARATION_DEBOUNCE_MS = 500;

let pricingConfig = {
  testMode: false,
  unitPrice: 1,
  currency: 'RM',
  durations: [
    { years: 1, label: 'Renew for 1 Year', price: 120, default: false },
    { years: 2, label: 'Renew for 2 Years - Save RM30', price: 210, default: true },
    { years: 3, label: 'Renew for 3 Years - Save RM60', price: 300, default: false },
    { years: 4, label: 'Renew for 4 Years - Save RM90', price: 390, default: false },
    { years: 5, label: 'Renew for 5 Years - Save RM120', price: 480, default: false },
  ],
  branch: { rate: 5, multiply_by_years: true, formula: [
    { operator: 'start', source: 'branches', value: 0 },
    { operator: 'multiply', source: 'renewal_years', value: 0 },
    { operator: 'multiply', source: 'branch_rate', value: 0 },
  ], item_name: 'Branch Renewal Fee' },
  addons: {
    compound: { price: 120, default_checked: true },
    info: { price: 30, default_checked: true },
    colored: { price: 50, default_checked: false },
  },
};
let lookupRequestId = 0;
let lookupValidated = false;
let verificationMode = 'idle';
let lookupAbortController = null;
let lookupTimeoutTimer = null;
let debounceTimer = null;
let lastCheckedRegistration = '';
let lastProcessedRegistration = '';
let checkingRegistration = '';
let lastObservedRegistration = '';
let compoundGuardInstalled = false;
let settingBusinessNameProgrammatically = false;
let businessNameSource = '';
let businessNameAssociatedNumber = '';
const LOOKUP_TIMEOUT_MS = 5000;
const LOOKUP_DEBOUNCE_MS = 1000;

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCurrency(amount) {
  return `${pricingConfig.currency || 'RM'}${numberValue(amount).toFixed(2)}`;
}

function getSelectedYears() {
  return Math.max(1, numberValue(duration?.selectedOptions?.[0]?.dataset?.years, 1));
}

function getSelectedDuration() {
  const years = getSelectedYears();
  return pricingConfig.durations.find((item) => Number(item.years) === years) || pricingConfig.durations[0];
}

function getRenewalAmount() {
  if (pricingConfig.testMode) return numberValue(pricingConfig.unitPrice, 1);
  return numberValue(getSelectedDuration()?.price, numberValue(duration?.value));
}

function normalizeBranchFormula(formula) {
  const allowedSources = ['branches', 'renewal_years', 'renewal_price', 'branch_rate', 'constant'];
  const allowedOperators = ['start', 'multiply', 'add', 'subtract', 'divide'];
  const rows = Array.isArray(formula) ? formula : [];
  const normalized = rows.slice(0, 8).map((step, index) => ({
    operator: index === 0 ? 'start' : (allowedOperators.includes(step?.operator) && step.operator !== 'start' ? step.operator : 'multiply'),
    source: allowedSources.includes(step?.source) ? step.source : 'constant',
    value: step?.source === 'constant' ? Math.max(0, numberValue(step?.value)) : 0,
  }));
  if (normalized.length) return normalized;
  return pricingConfig.branch?.multiply_by_years
    ? [{ operator: 'start', source: 'branches', value: 0 }, { operator: 'multiply', source: 'renewal_years', value: 0 }, { operator: 'multiply', source: 'branch_rate', value: 0 }]
    : [{ operator: 'start', source: 'branches', value: 0 }, { operator: 'multiply', source: 'branch_rate', value: 0 }];
}

function branchFormulaSourceValue(step, context) {
  if (step.source === 'constant') return Math.max(0, numberValue(step.value));
  return Math.max(0, numberValue(context[step.source]));
}

function evaluateBranchFormula(formula, context) {
  let result = 0;
  normalizeBranchFormula(formula).forEach((step, index) => {
    const value = branchFormulaSourceValue(step, context);
    if (index === 0) { result = value; return; }
    if (step.operator === 'add') result += value;
    else if (step.operator === 'subtract') result -= value;
    else if (step.operator === 'divide') result = Math.abs(value) < 0.0000001 ? 0 : result / value;
    else result *= value;
    if (!Number.isFinite(result)) result = 0;
  });
  return Math.max(0, result);
}

function branchFormulaLabel(formula) {
  const labels = { branches: 'Number of Branches', renewal_years: 'Renewal Years', renewal_price: 'Renewal Price', branch_rate: 'Branch Price' };
  const operators = { multiply: ' × ', add: ' + ', subtract: ' − ', divide: ' ÷ ' };
  return normalizeBranchFormula(formula).map((step, index) => {
    const label = step.source === 'constant' ? String(numberValue(step.value)) : (labels[step.source] || step.source);
    return `${index ? (operators[step.operator] || ' × ') : ''}${label}`;
  }).join('');
}

function getBranchFee() {
  const branchCount = Math.max(0, numberValue(branches?.value));
  if (pricingConfig.testMode) return numberValue(pricingConfig.unitPrice, 1) * branchCount;
  return evaluateBranchFormula(pricingConfig.branch?.formula, {
    branches: branchCount,
    renewal_years: getSelectedYears(),
    renewal_price: getRenewalAmount(),
    branch_rate: numberValue(pricingConfig.branch?.rate),
  });
}

function getAddOnAmount() {
  return addOns.reduce((sum, field) => {
    if (!field?.checked) return sum;
    if (pricingConfig.testMode) return sum + numberValue(pricingConfig.unitPrice, 1);
    const key = field.dataset.addonKey || field.id;
    return sum + numberValue(pricingConfig.addons?.[key]?.price, field.value);
  }, 0);
}

function escapeHtml(value) {
  const element = document.createElement('div');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}

function displayValue(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned || '—';
}

function isEmptyDisplayValue(value) {
  return displayValue(value) === '—';
}

function getApiRegistrationNumber(value) {
  const cleanedValue = String(value ?? '').trim().toUpperCase();

  if (/^\d{12}$/.test(cleanedValue)) return cleanedValue;

  const oldNumberMatch = cleanedValue.match(/^([A-Z0-9]{9})(?:-[A-Z]?)?$/);
  if (!oldNumberMatch) return '';

  const baseNumber = oldNumberMatch[1];
  if (/^\d{9}$/.test(baseNumber)) return baseNumber;
  if (/^[A-Z]\d{8}$/.test(baseNumber)) return baseNumber;
  if (/^[A-Z]{2}\d{7}$/.test(baseNumber)) return baseNumber;

  return '';
}

function getStoredRegistrationNumber(value) {
  return String(value ?? '').trim().toUpperCase();
}

function setFormFieldValue(field, value) {
  if (!field) return;
  const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (nativeValueSetter) nativeValueSetter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

function setBusinessNameValue(value, source, associatedNumber) {
  settingBusinessNameProgrammatically = true;
  setFormFieldValue(businessNameInput, value);
  settingBusinessNameProgrammatically = false;
  businessNameSource = source || '';
  businessNameAssociatedNumber = associatedNumber || '';
}

function setVerificationMarker(value) {
  setFormFieldValue(verificationMarkerInput, value);
}

function setRegistrationStatus(message, type = '') {
  if (!registrationStatus) return;
  registrationStatus.textContent = message;
  registrationStatus.className = `field-status${type ? ` is-${type}` : ''}`;
}

function setCheckboxChecked(field, checked) {
  if (!field) return;
  const nativeCheckedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
  if (nativeCheckedSetter) nativeCheckedSetter.call(field, checked);
  else field.checked = checked;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

function setBusinessNameManualMode(enabled) {
  if (!businessNameInput || !businessNameFieldWrapper) return;
  businessNameFieldWrapper.classList.toggle('is-manual', enabled);
  businessNameInput.readOnly = !enabled;
  if (enabled) {
    businessNameInput.required = true;
    businessNameInput.setAttribute('required', 'required');
    businessNameInput.setAttribute('aria-required', 'true');
  } else {
    businessNameInput.required = false;
    businessNameInput.removeAttribute('required');
    businessNameInput.removeAttribute('aria-required');
  }
}

function clearVerificationCard() {
  if (verificationCard) verificationCard.innerHTML = '';
}

function clearOldRegistration() {
  setFormFieldValue(oldRegistrationInput, '');
}

function clearBusinessName() {
  setBusinessNameValue('', '', '');
}

function setOldRegistration(value) {
  setFormFieldValue(oldRegistrationInput, String(value ?? '').trim());
}

function equalizeInfoLabelHeights() {
  if (!verificationCard) return;
  const labels = verificationCard.querySelectorAll('.ssm-info-label');
  labels.forEach((label) => { label.style.minHeight = ''; });
  if (window.matchMedia('(max-width: 685px)').matches) return;

  let maximumHeight = 0;
  labels.forEach((label) => {
    maximumHeight = Math.max(maximumHeight, label.getBoundingClientRect().height);
  });
  labels.forEach((label) => {
    label.style.minHeight = `${Math.ceil(maximumHeight)}px`;
  });
}

function renderVerificationCard(responseData) {
  if (!verificationCard) return;
  const info = responseData?.data || {};
  const entityName = displayValue(info.entityName);
  const newRegistrationNumber = displayValue(info.newRegistrationNumber);
  const oldRegistrationNumber = displayValue(info.registrationNumber);
  const status = displayValue(info.status);
  const upperStatus = status.toUpperCase();
  const isExpired = /\bEXPIRED\b/.test(upperStatus);
  const isActive = /\bACTIVE\b/.test(upperStatus) && !/\bINACTIVE\b/.test(upperStatus);
  const statusClass = isExpired ? 'is-expired' : (isActive ? 'is-active' : '');
  const newClass = isEmptyDisplayValue(info.newRegistrationNumber) ? ' is-empty' : '';
  const oldClass = isEmptyDisplayValue(info.registrationNumber) ? ' is-empty' : '';

  forceExpiredCompound(isExpired);
  verificationCard.innerHTML = `
    <div class="ssm-card-panel">
      <div class="ssm-business-section">
        <span class="ssm-business-label">Business Profile</span>
        <div class="ssm-business-name">${escapeHtml(entityName)}</div>
      </div>
      <div class="ssm-card-body">
        <div class="ssm-info-grid">
          <div class="ssm-info-item">
            <span class="ssm-info-label">New Registration Number</span>
            <span class="ssm-info-value ssm-mono${newClass}">${escapeHtml(newRegistrationNumber)}</span>
          </div>
          <div class="ssm-info-item">
            <span class="ssm-info-label">Old Registration Number</span>
            <span class="ssm-info-value ssm-mono${oldClass}">${escapeHtml(oldRegistrationNumber)}</span>
          </div>
          <div class="ssm-info-item">
            <span class="ssm-info-label">Status</span>
            <span class="ssm-info-value ssm-status-value ${statusClass}">${escapeHtml(status)}</span>
          </div>
        </div>
      </div>
    </div>`;
  requestAnimationFrame(equalizeInfoLabelHeights);
}

function getExpiredPaymentOption() {
  const checkbox = document.querySelector('#compound');
  return {
    checkbox,
    wrapper: checkbox ? (checkbox.closest('.addon-option-compound') || checkbox.closest('.checkbox-group')) : null,
  };
}

function syncExpiredCheckbox() {
  const { checkbox, wrapper } = getExpiredPaymentOption();
  if (!checkbox || checkbox.dataset.ssmForced !== '1') return;

  wrapper?.classList.add('ssm-forced-compound');
  wrapper?.setAttribute('aria-disabled', 'true');
  checkbox.setAttribute('aria-disabled', 'true');
  checkbox.tabIndex = -1;
  if (!checkbox.checked) setCheckboxChecked(checkbox, true);
}

function installExpiredCheckboxGuard() {
  if (compoundGuardInstalled) return;
  compoundGuardInstalled = true;

  function isForcedPaymentArea(event) {
    const { checkbox, wrapper } = getExpiredPaymentOption();
    if (!checkbox || checkbox.dataset.ssmForced !== '1') return false;
    return event.target === checkbox || Boolean(wrapper && wrapper.contains(event.target));
  }

  function blockForcedPaymentToggle(event) {
    if (!isForcedPaymentArea(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    queueMicrotask(syncExpiredCheckbox);
  }

  document.addEventListener('pointerdown', blockForcedPaymentToggle, true);
  document.addEventListener('mousedown', blockForcedPaymentToggle, true);
  document.addEventListener('click', blockForcedPaymentToggle, true);
  document.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    blockForcedPaymentToggle(event);
  }, true);
  document.addEventListener('change', (event) => {
    const { checkbox } = getExpiredPaymentOption();
    if (!checkbox || event.target !== checkbox || checkbox.dataset.ssmForced !== '1' || checkbox.checked) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    queueMicrotask(syncExpiredCheckbox);
  }, true);
}

function forceExpiredCompound(isExpired) {
  installExpiredCheckboxGuard();
  const { checkbox, wrapper } = getExpiredPaymentOption();
  if (!checkbox) return;

  if (isExpired) {
    if (checkbox.dataset.ssmForced !== '1') {
      checkbox.dataset.ssmPreviousChecked = checkbox.checked ? '1' : '0';
      checkbox.dataset.ssmPreviousTabIndex = String(checkbox.tabIndex);
    }
    checkbox.dataset.ssmForced = '1';
    syncExpiredCheckbox();
    return;
  }

  if (checkbox.dataset.ssmForced === '1') {
    const previousChecked = checkbox.dataset.ssmPreviousChecked === '1';
    const previousTabIndex = Number(checkbox.dataset.ssmPreviousTabIndex ?? 0);
    checkbox.dataset.ssmForced = '0';
    checkbox.removeAttribute('aria-disabled');
    checkbox.tabIndex = Number.isNaN(previousTabIndex) ? 0 : previousTabIndex;
    wrapper?.classList.remove('ssm-forced-compound');
    wrapper?.removeAttribute('aria-disabled');
    delete checkbox.dataset.ssmPreviousChecked;
    delete checkbox.dataset.ssmPreviousTabIndex;
    setCheckboxChecked(checkbox, previousChecked);
  }
}

function cancelLookupRequest() {
  clearTimeout(lookupTimeoutTimer);
  lookupTimeoutTimer = null;
  if (lookupAbortController) {
    lookupAbortController.abort();
    lookupAbortController = null;
  }
  checkingRegistration = '';
  resetPayButton();
}

function applyVerifiedMode(data, normalizedValue) {
  verificationMode = 'verified';
  lookupValidated = true;
  lastCheckedRegistration = normalizedValue;
  lastProcessedRegistration = normalizedValue;
  checkingRegistration = '';

  setBusinessNameManualMode(false);
  setBusinessNameValue(data?.data?.entityName || '', 'api', normalizedValue);
  setOldRegistration(data?.data?.registrationNumber || '');
  setVerificationMarker('Verified');
  renderVerificationCard(data);
  setRegistrationStatus('Business details verified.', 'success');
}

function applyNotFoundMode(message, normalizedValue = '') {
  verificationMode = 'not_found';
  lookupValidated = false;
  lastCheckedRegistration = '';
  lastProcessedRegistration = normalizedValue || getApiRegistrationNumber(registrationInput?.value);
  checkingRegistration = '';

  setBusinessNameManualMode(false);
  clearBusinessName();
  clearOldRegistration();
  setVerificationMarker('');
  clearVerificationCard();
  forceExpiredCompound(false);
  setRegistrationStatus(message || "Registration Number doesn't exist, please make sure it is NON SDN BHD.", 'error');
}

function applyFallbackMode(data, normalizedValue) {
  verificationMode = 'fallback';
  lookupValidated = Boolean(normalizedValue);
  lastCheckedRegistration = '';
  lastProcessedRegistration = normalizedValue;
  checkingRegistration = '';

  setBusinessNameManualMode(true);
  setVerificationMarker('Unverified');
  forceExpiredCompound(false);

  const returnedOldNumber = String(data?.data?.registrationNumber || '').trim();
  if (returnedOldNumber) setOldRegistration(returnedOldNumber);

  clearVerificationCard();
  setRegistrationStatus('');
  resetPayButton();
}

function applyInvalidFormatMode(message) {
  verificationMode = 'invalid_format';
  lookupValidated = false;
  lastCheckedRegistration = '';
  checkingRegistration = '';
  setVerificationMarker('');
  setBusinessNameManualMode(false);
  clearBusinessName();
  clearOldRegistration();
  clearVerificationCard();
  forceExpiredCompound(false);
  setRegistrationStatus(message || 'Please enter a valid registration number format.', 'error');
}

function clearValuesForChangedNumber(normalizedValue) {
  clearOldRegistration();
  forceExpiredCompound(false);
  setVerificationMarker('');
  clearVerificationCard();

  const manualBelongsToAnotherNumber =
    businessNameSource === 'manual' &&
    businessNameAssociatedNumber &&
    normalizedValue &&
    businessNameAssociatedNumber !== normalizedValue;

  if (businessNameSource === 'api' || manualBelongsToAnotherNumber || !normalizedValue) {
    clearBusinessName();
  }

  setBusinessNameManualMode(false);
}

function resetVerificationState({ clearStatus = true } = {}) {
  lookupValidated = false;
  verificationMode = 'idle';
  lastCheckedRegistration = '';
  lastProcessedRegistration = '';
  clearValuesForChangedNumber('');
  if (clearStatus) setRegistrationStatus('');
}

function handleServerResponse(data, normalizedValue) {
  switch (data?.mode) {
    case 'verified':
      applyVerifiedMode(data, normalizedValue);
      return true;
    case 'not_found':
      applyNotFoundMode(data?.message, normalizedValue);
      return false;
    case 'fallback':
      applyFallbackMode(data, normalizedValue);
      return true;
    case 'invalid_format':
    default:
      applyInvalidFormatMode(data?.message);
      return false;
  }
}

async function lookupBusiness(normalizedValue) {
  if (!normalizedValue) {
    applyInvalidFormatMode('Please enter a valid registration number format.');
    return false;
  }

  if (normalizedValue === checkingRegistration) return false;
  if (normalizedValue === lastProcessedRegistration && verificationMode !== 'idle') {
    return verificationMode === 'verified' || verificationMode === 'fallback';
  }

  cancelLookupRequest();
  const controller = new AbortController();
  lookupAbortController = controller;
  const requestId = ++lookupRequestId;
  checkingRegistration = normalizedValue;
  verificationMode = 'checking';
  lookupValidated = false;
  setVerificationMarker('');
  setRegistrationStatus('Looking up business details...', 'loading');
  if (payButton) payButton.disabled = true;

  lookupTimeoutTimer = window.setTimeout(() => {
    const latestValue = getApiRegistrationNumber(registrationInput?.value);
    if (
      requestId !== lookupRequestId ||
      controller !== lookupAbortController ||
      latestValue !== normalizedValue
    ) return;

    lookupAbortController = null;
    lookupTimeoutTimer = null;
    checkingRegistration = '';
    controller.abort();
    applyFallbackMode({
      mode: 'fallback',
      data: null,
    }, normalizedValue);
    resetPayButton();
  }, LOOKUP_TIMEOUT_MS);

  try {
    const formData = new URLSearchParams();
    formData.set('action', window.OneStopSSM?.ajaxAction || 'onestop_ssm_check_ssm');
    formData.set('number', normalizedValue);
    const response = await fetch(window.OneStopSSM.ajaxUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: formData.toString(),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`SSM request failed with status ${response.status}`);
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== 'object') throw new Error('SSM verification returned an invalid server response.');

    const latestValue = getApiRegistrationNumber(registrationInput?.value);
    if (requestId !== lookupRequestId || controller !== lookupAbortController || latestValue !== normalizedValue) return false;

    clearTimeout(lookupTimeoutTimer);
    lookupTimeoutTimer = null;
    return handleServerResponse(data, normalizedValue);
  } catch (error) {
    if (error?.name === 'AbortError') return false;
    if (requestId !== lookupRequestId) return false;

    clearTimeout(lookupTimeoutTimer);
    lookupTimeoutTimer = null;
    applyFallbackMode({
      mode: 'fallback',
      data: null,
    }, normalizedValue);
    return true;
  } finally {
    if (controller === lookupAbortController) {
      clearTimeout(lookupTimeoutTimer);
      lookupTimeoutTimer = null;
      lookupAbortController = null;
      checkingRegistration = '';
      resetPayButton();
    }
  }
}

function checkRegistrationNumber() {
  if (!registrationInput) return Promise.resolve(false);
  const enteredValue = registrationInput.value.trim();
  const normalizedValue = getApiRegistrationNumber(enteredValue);

  if (!enteredValue) {
    applyInvalidFormatMode('Please enter a registration number.');
    return Promise.resolve(false);
  }

  if (!normalizedValue) {
    applyInvalidFormatMode('Please enter a valid registration number format.');
    return Promise.resolve(false);
  }

  return lookupBusiness(normalizedValue);
}

function scheduleLookup() {
  if (!registrationInput) return;
  clearTimeout(debounceTimer);

  const currentValue = getApiRegistrationNumber(registrationInput.value);

  if (currentValue !== lastObservedRegistration) {
    cancelLookupRequest();
    clearValuesForChangedNumber(currentValue);
    lastObservedRegistration = currentValue;
    lookupValidated = false;
    verificationMode = 'idle';
    lastCheckedRegistration = '';
    lastProcessedRegistration = '';
    setRegistrationStatus('');
  }

  if (!registrationInput.value.trim()) return;
  debounceTimer = window.setTimeout(checkRegistrationNumber, LOOKUP_DEBOUNCE_MS);
}

function showSubmissionError(message, field) {
  setRegistrationStatus(message, 'error');
  if (field) field.focus();
}

function resetPayButton() {
  if (!payButton) return;
  if (IS_FIUU_PREPARED) {
    const cardInpageSelected = CARD_USES_INPAGE && getPaymentSelection().category === 'card';
    const button = replacePayButton({ disabled: false, label: 'Pay Now' });
    if (button) button.hidden = cardInpageSelected;
    return;
  }
  payButton.hidden = false;
  payButton.disabled = false;
  payButton.textContent = PAY_BUTTON_LABEL;
}

function updateAddOnHints() {
  const compoundField = document.querySelector('#compound');
  const infoField = document.querySelector('#info');
  if (compoundHint) compoundHint.hidden = Boolean(compoundField?.checked);
  if (infoHint) infoHint.hidden = Boolean(infoField?.checked);
}

function defaultDuration() {
  return pricingConfig.durations.find((item) => Boolean(item.default)) || pricingConfig.durations[0];
}

function resetPricingFieldDefaults() {
  const selected = defaultDuration();
  if (duration && selected) duration.value = String(selected.price);
  if (branches) branches.value = '0';
  Object.entries(pricingConfig.addons || {}).forEach(([key, addon]) => {
    const field = document.querySelector(`#${CSS.escape(key)}`);
    if (field) field.checked = Boolean(addon.default_checked);
  });
}

function applyPricingConfig(config) {
  const durations = Array.isArray(config?.durations) && config.durations.length ? config.durations : pricingConfig.durations;
  pricingConfig = {
    testMode: Boolean(config?.testMode),
    unitPrice: numberValue(config?.unitPrice, 1),
    currency: String(config?.currency || 'RM'),
    durations: durations.map((item, index) => ({
      years: Math.max(1, numberValue(item?.years, index + 1)),
      label: String(item?.label || `Renew for ${index + 1} Year${index ? 's' : ''}`),
      price: Math.max(0, numberValue(item?.price)),
      default: Boolean(item?.default),
    })),
    branch: {
      rate: Math.max(0, numberValue(config?.branch?.rate, 5)),
      multiply_by_years: Boolean(config?.branch?.multiply_by_years),
      formula: normalizeBranchFormula(config?.branch?.formula),
      item_name: String(config?.branch?.item_name || 'Branch Renewal Fee'),
    },
    addons: config?.addons || pricingConfig.addons,
  };
  window.__paymentTestMode = pricingConfig.testMode;

  if (duration) {
    const previousYears = getSelectedYears();
    duration.innerHTML = '';
    pricingConfig.durations.forEach((item) => {
      const option = document.createElement('option');
      option.value = String(pricingConfig.testMode ? pricingConfig.unitPrice : item.price);
      option.dataset.years = String(item.years);
      option.textContent = pricingConfig.testMode
        ? `${item.label} (TEST ${formatCurrency(pricingConfig.unitPrice)})`
        : `${item.label} (${formatCurrency(item.price)})`;
      option.selected = item.years === previousYears || (!pricingConfig.durations.some((entry) => entry.years === previousYears) && item.default);
      duration.appendChild(option);
    });
  }

  Object.entries(pricingConfig.addons || {}).forEach(([key, addon]) => {
    const field = document.querySelector(`#${CSS.escape(key)}`);
    if (!field) return;
    field.value = String(pricingConfig.testMode ? pricingConfig.unitPrice : numberValue(addon.price));
    const price = field.closest('label')?.querySelector('.addon-price');
    if (price) price.textContent = `(+${formatCurrency(pricingConfig.testMode ? pricingConfig.unitPrice : addon.price)})`;
  });

  const branchHint = document.querySelector('#branches + .field-hint');
  if (branchHint) {
    branchHint.textContent = pricingConfig.testMode
      ? `TEST ${formatCurrency(pricingConfig.unitPrice)} per branch.`
      : `Calculation: ${branchFormulaLabel(pricingConfig.branch.formula)}.`;
  }
}

async function loadPricingConfig() {
  try {
    const response = await fetch(window.OneStopSSM.restBase + 'pricing-config?form_id=' + encodeURIComponent(FORM_ID));
    const config = await response.json().catch(() => ({}));
    if (response.ok) applyPricingConfig(config);
  } catch (error) {
    // The server-rendered values remain usable if the endpoint is unavailable.
  }
}

function updateTotal() {
  if (!total) return;
  const renewalAmount = getRenewalAmount();
  const branchAmount = getBranchFee();
  const addOnAmount = getAddOnAmount();
  const grandTotal = renewalAmount + branchAmount + addOnAmount;
  if (renewalFee) renewalFee.textContent = formatCurrency(renewalAmount);
  if (branchFeeRow && branchFeeAmount) {
    branchFeeRow.hidden = branchAmount <= 0;
    branchFeeAmount.textContent = formatCurrency(branchAmount);
  }
  if (addonFeeRow && addonFeeAmount) {
    addonFeeRow.hidden = addOnAmount <= 0;
    addonFeeAmount.textContent = formatCurrency(addOnAmount);
  }
  total.textContent = formatCurrency(grandTotal);
}

businessNameInput?.addEventListener('input', () => {
  if (settingBusinessNameProgrammatically) return;

  if (verificationMode === 'fallback') {
    businessNameInput.value =
      businessNameInput.value.toUpperCase();

    businessNameSource = 'manual';
    businessNameAssociatedNumber =
      getApiRegistrationNumber(registrationInput?.value);
  }
});

registrationInput?.addEventListener('input', scheduleLookup);
registrationInput?.addEventListener('blur', () => {
  clearTimeout(debounceTimer);
  const enteredValue = registrationInput.value.trim();
  const normalizedValue = getApiRegistrationNumber(enteredValue);

  if (!enteredValue) return;
  if (!normalizedValue) {
    applyInvalidFormatMode('Please enter a valid registration number format.');
    return;
  }

  if (
    normalizedValue !== checkingRegistration &&
    (verificationMode !== 'verified' || normalizedValue !== lastCheckedRegistration) &&
    normalizedValue !== lastProcessedRegistration
  ) {
    lookupBusiness(normalizedValue);
  }
});
duration?.addEventListener('change', updateTotal);
branches?.addEventListener('input', updateTotal);
addOns.forEach((field) => field?.addEventListener('change', () => { updateAddOnHints(); updateTotal(); }));

document.addEventListener('renewal-draft-restored', (event) => {
  if (event.detail?.pricingModeChanged) resetPricingFieldDefaults();
  updateAddOnHints();
  updateTotal();
  cancelLookupRequest();
  lookupValidated = false;
  verificationMode = 'idle';
  setVerificationMarker('');
  clearVerificationCard();
  setBusinessNameManualMode(false);
  const restoredRegistration = registrationInput?.value.trim() || '';
  const normalizedRestoredRegistration = getApiRegistrationNumber(restoredRegistration);
  lastObservedRegistration = normalizedRestoredRegistration;
  if (normalizedRestoredRegistration) {
    lookupBusiness(normalizedRestoredRegistration);
  } else if (restoredRegistration) {
    applyInvalidFormatMode('Please enter a valid registration number format.');
  }
});

async function initRenewalForm() {
  await loadPricingConfig();
  window.__pricingConfigReady = true;
  document.dispatchEvent(new CustomEvent('pricing-config-ready'));
  updateAddOnHints();
  updateTotal();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initRenewalForm);
else initRenewalForm();

function detectClientBrowser() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua) || /Opera/.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  return 'Other';
}

function getPaymentSelection() {
  return {
    category: renewalForm?.querySelector('input[name="paymentCategory"]:checked')?.value || '',
    bank: paymentBank?.value || '',
    wallet: renewalForm?.querySelector('input[name="paymentWallet"]:checked')?.value || '',
  };
}

function paymentSelectionError(selection) {
  if (!selection.category) return 'Please choose a payment method.';
  if (selection.category === 'online_banking' && !selection.bank) return 'Please choose your bank.';
  if (selection.category === 'business_banking' && !selection.bank) return 'Please choose your business bank.';
  if (selection.category === 'ewallet' && !selection.wallet) return 'Please choose a QR or e-wallet.';
  if (!['online_banking', 'business_banking', 'card', 'ewallet'].includes(selection.category)) return 'Please choose a valid payment method.';
  return '';
}

function showPaymentMethodError(message) {
  if (!paymentMethodError) return;
  paymentMethodError.textContent = String(message || '');
  paymentMethodError.hidden = !message;
  paymentMethodSection?.classList.toggle('has-payment-error', Boolean(message));
}

function showPaymentMethodStatus(message) {
  if (!paymentMethodStatus) return;
  paymentMethodStatus.textContent = String(message || '');
  paymentMethodStatus.hidden = !message;
}

function showFormSubmitError(message) {
  if (!formSubmitError) return;
  formSubmitError.textContent = String(message || '');
  formSubmitError.hidden = !message;
}

function paymentPickerPlaceholder(picker) {
  if (picker?.dataset?.paymentPicker === 'bank') return 'Search or choose your bank';
  if (picker?.dataset?.paymentPicker === 'business_bank') return 'Search or choose your business bank';
  return 'Search or choose payment method';
}

function paymentPickerValue(picker) {
  if (['bank', 'business_bank'].includes(picker?.dataset?.paymentPicker)) return paymentBank?.value || '';
  return renewalForm?.querySelector('input[name="paymentWallet"]:checked')?.value || '';
}

function filterPaymentPicker(picker, query = '') {
  if (!picker) return;
  const normalizedQuery = String(query || '').trim().toLowerCase();
  let visibleCount = 0;
  picker.querySelectorAll('[data-payment-option]').forEach((option) => {
    const matches = !normalizedQuery || option.textContent.trim().toLowerCase().includes(normalizedQuery);
    option.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  const emptyState = picker.querySelector('.osr-payment-picker-empty');
  if (emptyState) emptyState.hidden = visibleCount > 0;
}

function closePaymentPicker(picker, restoreFocus = false) {
  if (!picker) return;
  const trigger = picker.querySelector('.osr-payment-picker-trigger');
  const menu = picker.querySelector('.osr-payment-picker-menu');
  if (menu) menu.hidden = true;
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  picker.classList.remove('is-open');
  if (restoreFocus) trigger?.focus();
}

function closeOtherPaymentPickers(activePicker = null) {
  paymentPickers.forEach((picker) => {
    if (picker !== activePicker) closePaymentPicker(picker);
  });
}

function openPaymentPicker(picker) {
  if (!picker || picker.hidden) return;
  closeOtherPaymentPickers(picker);
  const trigger = picker.querySelector('.osr-payment-picker-trigger');
  const menu = picker.querySelector('.osr-payment-picker-menu');
  const search = picker.querySelector('[data-payment-search]');
  if (!menu || !trigger) return;
  menu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  picker.classList.add('is-open');
  if (search) {
    search.value = '';
    filterPaymentPicker(picker, '');
    window.requestAnimationFrame(() => search.focus());
  }
}

function applyPaymentLogo(image, logo = '', fallback = '') {
  if (!image) return;
  image.dataset.logoFallback = fallback || '';
  image.dataset.logoFallbackUsed = '';
  if (image.dataset.logoFallbackBound !== '1') {
    image.addEventListener('error', () => {
      const fallbackUrl = image.dataset.logoFallback || '';
      if (fallbackUrl && image.dataset.logoFallbackUsed !== '1') {
        image.dataset.logoFallbackUsed = '1';
        image.src = fallbackUrl;
        image.hidden = false;
        return;
      }
      image.hidden = true;
    });
    image.dataset.logoFallbackBound = '1';
  }
  if (logo) {
    image.hidden = false;
    image.src = logo;
    if (image.complete && image.naturalWidth === 0) image.dispatchEvent(new Event('error'));
  } else {
    image.removeAttribute('src');
    image.hidden = true;
  }
}

function updatePaymentPickerSelection(picker) {
  if (!picker) return;
  const selectedValue = paymentPickerValue(picker);
  const triggerLabel = picker.querySelector('[data-payment-selected-label]');
  const triggerLogo = picker.querySelector('[data-payment-selected-logo]');
  const selectedOption = Array.from(picker.querySelectorAll('[data-payment-option]')).find((option) => option.dataset.paymentValue === selectedValue);
  picker.querySelectorAll('[data-payment-option]').forEach((option) => {
    option.setAttribute('aria-selected', option === selectedOption ? 'true' : 'false');
    option.classList.toggle('is-selected', option === selectedOption);
  });
  if (triggerLabel) triggerLabel.textContent = selectedOption?.dataset?.paymentLabel || paymentPickerPlaceholder(picker);
  if (triggerLogo) {
    const logo = selectedOption?.dataset?.paymentLogo || '';
    const fallback = selectedOption?.dataset?.paymentLogoFallback || '';
    applyPaymentLogo(triggerLogo, logo, fallback);
  }
  picker.classList.toggle('has-selection', Boolean(selectedOption));
}

function selectPaymentPickerOption(option) {
  const picker = option?.closest?.('[data-payment-picker]');
  const value = option?.dataset?.paymentValue || '';
  if (!picker || !value || option.disabled || option.getAttribute?.('aria-disabled') === 'true') return;

  if (['bank', 'business_bank'].includes(picker.dataset.paymentPicker)) {
    if (!paymentBank) return;
    paymentBank.value = value;
    paymentBank.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    const walletInput = Array.from(paymentWalletInputs).find((input) => input.value === value);
    if (!walletInput) return;
    walletInput.checked = true;
    walletInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  updatePaymentPickerSelection(picker);
  closePaymentPicker(picker, true);
}

function bindPaymentPickers() {
  paymentPickers.forEach((picker) => {
    const trigger = picker.querySelector('.osr-payment-picker-trigger');
    const menu = picker.querySelector('.osr-payment-picker-menu');
    const search = picker.querySelector('[data-payment-search]');

    trigger?.addEventListener('click', () => {
      if (menu?.hidden) openPaymentPicker(picker);
      else closePaymentPicker(picker);
    });
    search?.addEventListener('input', () => filterPaymentPicker(picker, search.value));
    picker.querySelectorAll('[data-payment-option]').forEach((option) => {
      const optionLogo = option.querySelector('.osr-payment-option-logo');
      if (optionLogo) applyPaymentLogo(optionLogo, option.dataset.paymentLogo || optionLogo.getAttribute('src') || '', option.dataset.paymentLogoFallback || '');
      option.addEventListener('click', () => selectPaymentPickerOption(option));
    });
    picker.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || menu?.hidden) return;
      event.preventDefault();
      closePaymentPicker(picker, true);
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target?.closest?.('[data-payment-picker]')) closeOtherPaymentPickers();
  });
}

function setCardInpageStatus(message, state = '') {
  if (!cardInpageStatus) return;
  cardInpageStatus.textContent = message || '';
  cardInpageStatus.hidden = !message;
  cardInpageStatus.classList.toggle('is-ready', state === 'ready');
  cardInpageStatus.classList.toggle('is-warning', state === 'warning');
}

function stopInpageWatch() {
  if (inpageObserver) {
    inpageObserver.disconnect();
    inpageObserver = null;
  }
  if (inpageTimer) {
    window.clearTimeout(inpageTimer);
    inpageTimer = null;
  }
}

function resetInpageController() {
  if (!cardInpageController) return;
  const jqController = window.jQuery ? window.jQuery(cardInpageController) : null;
  Array.from(cardInpageController.attributes).forEach((attribute) => {
    if (!attribute.name.startsWith('data-mps')) return;
    const dataKey = attribute.name.slice(5);
    cardInpageController.removeAttribute(attribute.name);
    jqController?.removeData(dataKey);
  });
  cardInpageController.checked = false;
}

function resetCardFallback() {
  if (!cardInpageFallback) return;
  const replacement = cardInpageFallback.cloneNode(true);
  replacement.hidden = true;
  cardInpageFallback.replaceWith(replacement);
  cardInpageFallback = replacement;
}

function clearPreparedInpage({ preserveMessage = false } = {}) {
  stopInpageWatch();
  resetInpageController();
  resetCardFallback();
  if (cardFrame) cardFrame.replaceChildren();
  if (!preserveMessage) setCardInpageStatus('');
}

function setInpageControllerOptions(options) {
  if (!cardInpageController) return;
  resetInpageController();
  const jqController = window.jQuery ? window.jQuery(cardInpageController) : null;
  cardInpageController.setAttribute('data-toggle', 'molpayseamlessiframe');
  Object.entries(options || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    cardInpageController.setAttribute(`data-${key}`, String(value));
    jqController?.data(key, value);
  });
}

function cardIframeLoaded() {
  return Boolean(cardFrame?.querySelector('iframe'));
}

function bindFallbackSeamless(options, revision, fingerprint) {
  if (!cardInpageFallback || !window.jQuery || typeof window.jQuery.fn?.MOLPaySeamless !== 'function') return false;
  const fallbackOptions = { ...(options || {}) };
  delete fallbackOptions.mpsccbox;
  resetCardFallback();
  if (!cardInpageFallback) return false;
  cardInpageFallback.hidden = false;
  cardInpageFallback.setAttribute('data-toggle', 'molpayseamless');
  cardInpageFallback.addEventListener('click', markPreparedPaymentStarted, { capture: true });
  window.jQuery(cardInpageFallback).MOLPaySeamless(fallbackOptions);
  cardInpageFallback.addEventListener('click', () => window.RenewalFormDraft?.save());
  preparedRevision = revision;
  preparedSeamlessOptions = fallbackOptions;
  preparedFingerprint = fingerprint;
  return true;
}

function bindPreparedInpage(options, revision, fingerprint) {
  if (revision !== preparationRevision) return;
  if (!window.jQuery || !cardInpage || !cardFrame || !cardInpageController) {
    throw new Error('Secure inline card payment could not be loaded. Please refresh and try again.');
  }

  clearPreparedInpage();
  cardInpage.hidden = false;
  const mainButton = replacePayButton({ disabled: true, label: 'Pay Now' });
  if (mainButton) mainButton.hidden = true;
  setCardInpageStatus('Preparing secure card form...');
  setInpageControllerOptions(options);

  const markReady = () => {
    if (revision !== preparationRevision || !cardIframeLoaded()) return false;
    stopInpageWatch();
    if (cardInpageFallback) cardInpageFallback.hidden = true;
    preparedRevision = revision;
    preparedSeamlessOptions = options;
    preparedFingerprint = fingerprint;
    setCardInpageStatus('Secure card form is ready.', 'ready');
    showPaymentMethodStatus('Secure card payment is ready.');
    showPaymentMethodError('');
    return true;
  };

  inpageObserver = new MutationObserver(() => markReady());
  inpageObserver.observe(cardFrame, { childList: true, subtree: true });

  inpageTimer = window.setTimeout(() => {
    if (revision !== preparationRevision || markReady()) return;
    stopInpageWatch();
    const hasFallback = bindFallbackSeamless(options, revision, fingerprint);
    setCardInpageStatus(
      hasFallback
        ? "The inline card form did not load. You can continue using Fiuu's secure card page below."
        : 'The inline card form did not load. Please refresh and try again.',
      'warning'
    );
    showPaymentMethodStatus(hasFallback ? 'Secure card-page fallback is ready.' : '');
  }, INPAGE_IFRAME_TIMEOUT_MS);

  // Fiuu Inpage v2.0 is controller/data-attribute driven. Trigger the
  // off-screen controller after the server-generated vcode and order data are set.
  window.jQuery(cardInpageController).trigger('click');
  markReady();
}

function syncPaymentMethodUi() {
  if (!paymentMethodSection) return;
  const selection = getPaymentSelection();
  const showBank = selection.category === 'online_banking';
  const showBusinessBank = selection.category === 'business_banking';
  const showCard = selection.category === 'card';
  const showCardInpage = showCard && CARD_USES_INPAGE;
  const showWallet = selection.category === 'ewallet';

  if (bankOptions) bankOptions.hidden = !showBank;
  if (businessBankOptions) businessBankOptions.hidden = !showBusinessBank;
  if (cardInpage) cardInpage.hidden = !showCardInpage;
  if (ewalletOptions) ewalletOptions.hidden = !showWallet;
  if (payButton && IS_FIUU_PREPARED) payButton.hidden = showCardInpage;
  if (paymentBank) paymentBank.disabled = !(showBank || showBusinessBank);
  if (paymentWalletFieldset) paymentWalletFieldset.disabled = !showWallet;
  if (!showBank && !showBusinessBank && paymentBank) paymentBank.value = '';
  if (!showWallet) paymentWalletInputs.forEach((input) => { input.checked = false; });
  if (!showCardInpage) clearPreparedInpage();
  else if (!cardIframeLoaded() && cardInpageFallback?.hidden !== false) setCardInpageStatus('Complete the required form details to load the secure card form.');

  paymentMethodSection.querySelectorAll('.osr-payment-option').forEach((label) => {
    const radio = label.querySelector('input[name="paymentCategory"]');
    const selected = Boolean(radio?.checked);
    label.classList.toggle('is-selected', selected);
    label.closest('.osr-payment-choice')?.classList.toggle('is-selected', selected);
    if (radio?.hasAttribute('aria-controls')) radio.setAttribute('aria-expanded', selected ? 'true' : 'false');
  });

  if (!showBank) closePaymentPicker(bankOptions);
  if (!showBusinessBank) closePaymentPicker(businessBankOptions);
  if (!showWallet) closePaymentPicker(ewalletOptions);
  paymentPickers.forEach((picker) => updatePaymentPickerSelection(picker));
}

function buildSubmissionPayload() {
  const enteredRegistration = registrationInput?.value.trim() || '';
  const paymentSelection = getPaymentSelection();
  return {
    registration: getStoredRegistrationNumber(enteredRegistration),
    businessName: businessNameInput?.value.trim() || '',
    oldRegistration: oldRegistrationInput?.value.trim() || '',
    verificationStatus: verificationMarkerInput?.value || '',
    duration: getRenewalAmount(),
    years: getSelectedYears(),
    branches: Math.max(0, numberValue(branches?.value)),
    branchFee: getBranchFee(),
    renewalAmount: getRenewalAmount(),
    addOns: Object.fromEntries(addOns.filter(Boolean).map((field) => [field.dataset.addonKey || field.id, field.checked])),
    total: getRenewalAmount() + getBranchFee() + getAddOnAmount(),
    sourceUrl: window.location.href,
    termsAgreed: document.querySelector('#terms-agreed')?.checked || false,
    clientMeta: { browser: detectClientBrowser(), platform: navigator.platform || 'Unknown' },
    name: renewalForm?.elements.namedItem('name')?.value.trim() || '',
    email: renewalForm?.elements.namedItem('email')?.value.trim() || '',
    phone: renewalForm?.elements.namedItem('phone')?.value.trim() || '',
    formId: FORM_ID,
    paymentCategory: paymentSelection.category,
    paymentBank: paymentSelection.bank,
    paymentWallet: paymentSelection.wallet,
    preparedRecordId,
    preparedToken,
    extraFields: Object.fromEntries(Array.from(renewalForm?.querySelectorAll('[data-osr-extra]') || []).map((field) => {
      const key = field.dataset.extraKey || field.name?.replace(/^extra\[|\]$/g, '') || '';
      let value = field.type === 'checkbox' ? (field.checked ? field.value : '') : field.value;
      if (field.type === 'radio') {
        const checked = renewalForm.querySelector(`input[type="radio"][data-extra-key="${CSS.escape(key)}"]:checked`);
        value = checked ? checked.value : '';
      }
      return [key, value];
    }).filter(([key]) => key)),
  };
}

function currentPreparationFingerprint(payload) {
  const { preparedRecordId: _preparedRecordId, preparedToken: _preparedToken, ...fingerprintPayload } = payload || {};
  return JSON.stringify(fingerprintPayload);
}

function preparedFormIsEligible() {
  if (!IS_FIUU_PREPARED || !renewalForm || !window.__pricingConfigReady) return false;
  const enteredRegistration = registrationInput?.value.trim() || '';
  const normalizedRegistration = getApiRegistrationNumber(enteredRegistration);
  const marker = verificationMarkerInput?.value || '';
  const manualFallbackReady = marker === 'Unverified' && Boolean(normalizedRegistration) && Boolean(businessNameInput?.value.trim());

  if (!normalizedRegistration) return false;
  if (!manualFallbackReady && (verificationMode === 'checking' || lookupAbortController)) return false;
  if (!manualFallbackReady && (!lookupValidated || verificationMode !== 'verified')) return false;
  if (!businessNameInput?.value.trim()) return false;
  if (!['Verified', 'Unverified'].includes(marker)) return false;
  if (!renewalForm.checkValidity()) return false;
  return paymentSelectionError(getPaymentSelection()) === '';
}

function preparedEligibilityMessage() {
  const selectionError = paymentSelectionError(getPaymentSelection());
  if (selectionError) return selectionError;
  const enteredRegistration = registrationInput?.value.trim() || '';
  if (!getApiRegistrationNumber(enteredRegistration)) return 'Please enter a valid registration number before payment.';
  if (verificationMode === 'checking' || lookupAbortController) return 'Please wait while the SSM number is being checked.';
  const marker = verificationMarkerInput?.value || '';
  const manualFallbackReady = marker === 'Unverified' && Boolean(businessNameInput?.value.trim());
  if (!manualFallbackReady && (!lookupValidated || verificationMode !== 'verified')) return 'Please verify the SSM registration number before payment.';
  if (!businessNameInput?.value.trim()) return 'Please complete the Business Name before payment.';
  if (!['Verified', 'Unverified'].includes(marker)) return 'Please verify the SSM registration number before payment.';
  if (!renewalForm?.checkValidity()) return 'Please complete all required form fields before payment.';
  return '';
}

function focusPaymentSelectionError(selection) {
  if (!paymentMethodSection) return;
  if (!selection.category) {
    paymentMethodSection.querySelector('input[name="paymentCategory"]:not(:disabled)')?.focus();
    return;
  }
  if (selection.category === 'online_banking' && !selection.bank) bankOptions?.querySelector('.osr-payment-picker-trigger')?.focus();
  if (selection.category === 'business_banking' && !selection.bank) businessBankOptions?.querySelector('.osr-payment-picker-trigger')?.focus();
  if (selection.category === 'ewallet' && !selection.wallet) ewalletOptions?.querySelector('.osr-payment-picker-trigger')?.focus();
}

function handleUnpreparedPayClick(event) {
  event?.preventDefault();
  const selection = getPaymentSelection();
  const selectionError = paymentSelectionError(selection);
  if (selectionError) {
    showPaymentMethodStatus('');
    showPaymentMethodError(selectionError);
    focusPaymentSelectionError(selection);
    return;
  }
  const eligibilityError = preparedEligibilityMessage();
  if (eligibilityError) {
    showPaymentMethodStatus('');
    showPaymentMethodError(eligibilityError);
    if (!renewalForm?.checkValidity()) renewalForm?.reportValidity?.();
    return;
  }
  showPaymentMethodError('');
  schedulePaymentPreparation();
}

function replacePayButton({ disabled = false, label = 'Pay Now', localValidation = true } = {}) {
  if (!payButton) return null;
  const replacement = payButton.cloneNode(true);
  replacement.type = IS_FIUU_PREPARED ? 'button' : replacement.type;
  replacement.disabled = disabled;
  replacement.hidden = false;
  replacement.textContent = label;
  replacement.classList.remove('is-preparing', 'is-prepared');
  replacement.removeAttribute('data-toggle');
  Array.from(replacement.attributes).forEach((attribute) => {
    if (attribute.name.startsWith('data-mps')) replacement.removeAttribute(attribute.name);
  });
  if (IS_FIUU_PREPARED && localValidation && !disabled) replacement.addEventListener('click', handleUnpreparedPayClick);
  payButton.replaceWith(replacement);
  payButton = replacement;
  return payButton;
}

function invalidatePreparedPayment() {
  if (!IS_FIUU_PREPARED) return;
  preparationRevision += 1;
  preparedRevision = 0;
  preparedSeamlessOptions = null;
  preparedFingerprint = '';
  clearTimeout(preparationTimer);
  preparationTimer = null;
  if (preparationAbortController) {
    preparationAbortController.abort();
    preparationAbortController = null;
  }
  const cardInpageSelected = CARD_USES_INPAGE && getPaymentSelection().category === 'card';
  clearPreparedInpage({ preserveMessage: cardInpageSelected });
  const button = replacePayButton({ disabled: false, label: 'Pay Now' });
  if (button) button.hidden = cardInpageSelected;
  if (cardInpageSelected) setCardInpageStatus('Complete the required form details to load the secure card form.');
  showPaymentMethodStatus('');
}

function parsePreparedHandoff(paymentUrl) {
  const url = new URL(paymentUrl, window.location.origin);
  return {
    recordId: url.searchParams.get('record_id') || '',
    token: url.searchParams.get('osr_token') || '',
  };
}

function rememberPreparedHandoff(handoff) {
  if (!handoff?.recordId || !handoff?.token) return;
  if (preparedRecordId !== handoff.recordId || preparedToken !== handoff.token) preparedStartSent = false;
  preparedRecordId = handoff.recordId;
  preparedToken = handoff.token;
}

function markPreparedPaymentStarted() {
  if (!IS_FIUU_PREPARED || preparedStartSent || !preparedRecordId || !preparedToken || !window.OneStopSSM?.restBase) return;
  preparedStartSent = true;
  const url = window.OneStopSSM.restBase + 'payment/fiuu/start';
  const body = JSON.stringify({ recordId: preparedRecordId, token: preparedToken });

  if (navigator.sendBeacon) {
    try {
      const queued = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      if (queued) return;
    } catch (_error) {}
  }

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    preparedStartSent = false;
  });
}

function bindPreparedSeamless(options, revision, fingerprint) {
  if (revision !== preparationRevision) return;
  clearPreparedInpage();
  if (!window.jQuery || typeof window.jQuery.fn?.MOLPaySeamless !== 'function') {
    throw new Error('Secure payment could not be loaded. Please refresh and try again.');
  }

  const button = replacePayButton({ disabled: false, label: 'Pay Now', localValidation: false });
  if (!button) throw new Error('Payment button is unavailable.');
  button.hidden = false;
  button.setAttribute('data-toggle', 'molpayseamless');
  button.addEventListener('click', markPreparedPaymentStarted, { capture: true });

  window.jQuery(button).MOLPaySeamless(options);
  button.addEventListener('click', () => window.RenewalFormDraft?.save());
  preparedRevision = revision;
  preparedSeamlessOptions = options;
  preparedFingerprint = fingerprint;
  button.classList.add('is-prepared');
  showPaymentMethodStatus('Secure payment is ready.');
  showPaymentMethodError('');
}


async function preparePayment(revision, fingerprint) {
  if (!IS_FIUU_PREPARED || revision !== preparationRevision || !preparedFormIsEligible()) return;

  const controller = new AbortController();
  preparationAbortController = controller;
  const button = replacePayButton({ disabled: true, label: 'Preparing secure payment...', localValidation: false });
  button?.classList.add('is-preparing');
  showPaymentMethodStatus('Preparing secure payment...');
  showPaymentMethodError('');

  try {
    const payload = buildSubmissionPayload();
    const createResponse = await fetch(window.OneStopSSM.restBase + 'payment/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const createData = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok || !createData.paymentUrl) throw new Error(createData.message || createData.error || 'Unable to prepare payment.');
    if (revision !== preparationRevision || controller !== preparationAbortController) return;

    const handoff = parsePreparedHandoff(createData.paymentUrl);
    if (!handoff.recordId || !handoff.token) throw new Error('The secure Fiuu payment token is missing.');
    rememberPreparedHandoff(handoff);

    const selection = getPaymentSelection();
    const seamlessResponse = await fetch(window.OneStopSSM.restBase + 'payment/fiuu/seamless', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recordId: handoff.recordId,
        token: handoff.token,
        paymentCategory: selection.category,
        paymentBank: selection.bank,
        paymentWallet: selection.wallet,
        revision,
      }),
      signal: controller.signal,
    });
    const seamlessData = await seamlessResponse.json().catch(() => ({}));
    const supportedPreparedMode = ['fiuu_prepared_seamless', 'fiuu_prepared_inpage'].includes(seamlessData.paymentMode);
    if (!seamlessResponse.ok || !supportedPreparedMode || !seamlessData.seamless) {
      throw new Error(seamlessData.message || seamlessData.error || 'Unable to initialise secure payment.');
    }
    if (revision !== preparationRevision || Number(seamlessData.revision) !== revision || controller !== preparationAbortController) return;

    if (seamlessData.paymentMode === 'fiuu_prepared_inpage') {
      bindPreparedInpage(seamlessData.seamless, revision, fingerprint);
    } else {
      bindPreparedSeamless(seamlessData.seamless, revision, fingerprint);
    }
    window.RenewalFormDraft?.save();
  } catch (error) {
    if (error?.name === 'AbortError' || revision !== preparationRevision) return;
    const cardInpageSelected = CARD_USES_INPAGE && getPaymentSelection().category === 'card';
    clearPreparedInpage({ preserveMessage: cardInpageSelected });
    const failedButton = replacePayButton({ disabled: false, label: 'Pay Now' });
    if (failedButton) failedButton.hidden = cardInpageSelected;
    if (cardInpageSelected) setCardInpageStatus('Secure card form could not be prepared. Please review the message below and try again.', 'warning');
    showPaymentMethodStatus('');
    showPaymentMethodError(error?.message || 'Could not prepare secure payment. Please change the payment method or refresh and try again.');
  } finally {
    if (controller === preparationAbortController) preparationAbortController = null;
  }
}

function schedulePaymentPreparation() {
  if (!IS_FIUU_PREPARED) return;
  clearTimeout(preparationTimer);
  preparationTimer = null;

  if (!preparedFormIsEligible()) {
    replacePayButton({ disabled: false, label: 'Pay Now' });
    showPaymentMethodStatus('');
    return;
  }

  const payload = buildSubmissionPayload();
  const fingerprint = currentPreparationFingerprint(payload);
  if (preparedSeamlessOptions && preparedRevision === preparationRevision && preparedFingerprint === fingerprint) return;

  const revision = preparationRevision;
  const cardSelected = getPaymentSelection().category === 'card';
  const cardInpageSelected = CARD_USES_INPAGE && cardSelected;
  if (payButton) {
    payButton.hidden = cardInpageSelected;
    payButton.disabled = true;
    payButton.textContent = 'Preparing secure payment...';
    payButton.classList.add('is-preparing');
  }
  if (cardInpageSelected) setCardInpageStatus('Preparing secure card form...');
  showPaymentMethodStatus('Preparing secure payment...');
  preparationTimer = window.setTimeout(() => preparePayment(revision, fingerprint), PREPARATION_DEBOUNCE_MS);
}

function handlePreparedFormMutation(event) {
  if (!IS_FIUU_PREPARED) return;
  if (event?.target?.matches?.('[data-payment-search]')) return;
  if (event?.target?.matches?.('input[name="paymentCategory"]')) {
    if (paymentBank) paymentBank.value = '';
    paymentWalletInputs.forEach((input) => { input.checked = false; });
  }
  if (event?.target?.matches?.('input[name="paymentCategory"], input[name="paymentWallet"], [name="paymentBank"]')) syncPaymentMethodUi();
  showPaymentMethodError('');
  invalidatePreparedPayment();
  schedulePaymentPreparation();
}

if (IS_FIUU_PREPARED && renewalForm) {
  bindPaymentPickers();
  syncPaymentMethodUi();
  const initialPayButton = replacePayButton({ disabled: false, label: 'Pay Now' });
  if (initialPayButton) initialPayButton.hidden = CARD_USES_INPAGE && getPaymentSelection().category === 'card';
  renewalForm.addEventListener('input', handlePreparedFormMutation);
  renewalForm.addEventListener('change', handlePreparedFormMutation);
  document.addEventListener('pricing-config-ready', () => { invalidatePreparedPayment(); schedulePaymentPreparation(); });
  document.addEventListener('renewal-draft-restored', () => { syncPaymentMethodUi(); invalidatePreparedPayment(); schedulePaymentPreparation(); });
}

renewalForm?.addEventListener('submit', async (event) => {
  if (IS_FIUU_PREPARED) {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  const enteredRegistration = registrationInput?.value.trim() || '';
  const normalizedRegistration = getApiRegistrationNumber(enteredRegistration);
  if (!normalizedRegistration) {
    applyInvalidFormatMode('Please enter a valid registration number format.');
    registrationInput?.focus();
    return;
  }
  const marker = verificationMarkerInput?.value || '';
  const manualFallbackReady = marker === 'Unverified' && Boolean(normalizedRegistration) && Boolean(businessNameInput?.value.trim());

  if (!manualFallbackReady && (verificationMode === 'checking' || lookupAbortController)) {
    setRegistrationStatus('Please wait while the SSM number is being checked.', 'loading');
    registrationInput?.focus();
    return;
  }
  if (!manualFallbackReady && (!lookupValidated || verificationMode !== 'verified')) {
    showSubmissionError('Please verify the SSM registration number before submitting.', registrationInput);
    return;
  }
  if (!businessNameInput?.value.trim()) {
    showSubmissionError(marker === 'Unverified' ? 'Please enter the Business Name before submitting.' : 'Business details are incomplete. Please verify the SSM number again.', businessNameInput);
    return;
  }
  if (!['Verified', 'Unverified'].includes(marker)) {
    showSubmissionError('Please verify the SSM registration number again.', registrationInput);
    return;
  }

  const payload = buildSubmissionPayload();
  showFormSubmitError('');
  if (payButton) { payButton.disabled = true; payButton.textContent = PAYMENT_REDIRECT_TEXT; }
  try {
    const response = await fetch(window.OneStopSSM.restBase + 'payment/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.paymentUrl) throw new Error(data.error || data.message || 'Unable to create payment.');
    window.RenewalFormDraft?.save();
    window.location.href = data.paymentUrl;
  } catch (error) {
    showFormSubmitError(error?.message || 'Payment could not be started. Please try again.');
    resetPayButton();
  }
});

window.addEventListener('pageshow', () => {
  if (IS_FIUU_PREPARED) {
    invalidatePreparedPayment();
    schedulePaymentPreparation();
  } else {
    resetPayButton();
  }
});
