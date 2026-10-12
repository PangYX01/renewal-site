document.addEventListener("DOMContentLoaded", function () {
    const inputField = document.getElementById("wpf_input_1196_text_1");
    const businessNameField = document.getElementById("wpf_input_1196_text");
    const oldRegistrationField = document.getElementById("wpf_input_1196_text_2");
    const verificationMarkerField = document.getElementById(
        "wpf_input_1196_hidden_input"
    );
    const businessNameWrapper = document.querySelector(".business-name");
    const errorContainer = document.getElementById("validation");
    const oldRegistrationText = document.getElementById(
        "oldRegistrationNumber"
    );
    const submitButton = document.getElementById(
        "stripe_form_submit_1196"
    );

    if (
        !inputField ||
        !businessNameField ||
        !oldRegistrationField ||
        !verificationMarkerField ||
        !businessNameWrapper ||
        !errorContainer ||
        !oldRegistrationText ||
        !submitButton
    ) {
        console.error(
            "SSM checker could not start because one or more required form fields are missing."
        );
        return;
    }

    const form = submitButton.closest("form") || inputField.closest("form");

    inputField.maxLength = 12;
	const SSM_LOOKUP_TIMEOUT_MS = 5000;

    let currentMode = "idle";
    let isValidNumber = false;
    let debounceTimer = null;
    let lastCheckedValue = "";
    let lastProcessedValue = "";
    let checkingValue = "";
    let lastObservedValue = "";
    let currentRequest = null;
    let expiredCheckboxGuardInstalled = false;
    let settingBusinessNameProgrammatically = false;
    let businessNameSource = "";
    let businessNameAssociatedNumber = "";

    function addVerificationCardStyles() {
        if (document.getElementById("ssm-verification-card-styles")) return;

        const style = document.createElement("style");
        style.id = "ssm-verification-card-styles";

        style.textContent = `
            #validation .ssm-card-panel {
                --ssm-navy-950: #0b1f3a;
                --ssm-navy-800: #12335c;
                --ssm-blue-600: #1d5fd6;
                --ssm-blue-100: #e6eefc;
                --ssm-slate-500: #5c6b84;
                --ssm-slate-300: #c7d1e0;
                --ssm-paper: #f6f8fc;
                --ssm-white: #ffffff;

                width: 100%;
                margin-top: 14px;
                overflow: hidden;
                color: var(--ssm-navy-950);
                background: var(--ssm-white);
                border: 1px solid #e3e9f3;
                border-radius: 18px;
                box-shadow:
                    0 1px 2px rgba(11, 31, 58, 0.04),
                    0 12px 32px -12px rgba(11, 31, 58, 0.14);
                font-family: "Inter", "Segoe UI", system-ui, sans-serif;
                box-sizing: border-box;
            }

            #validation .ssm-card-panel *,
            #validation .ssm-card-panel *::before,
            #validation .ssm-card-panel *::after {
                box-sizing: border-box;
            }

            #validation .ssm-business-section {
                position: relative;
                overflow: hidden;
                margin: 0;
                padding: 20px 32px;
                background: linear-gradient(
                    135deg,
                    var(--ssm-navy-950) 0%,
                    var(--ssm-navy-800) 55%,
                    var(--ssm-blue-600) 130%
                );
                border: 0;
            }

            #validation .ssm-business-section::after {
                content: "";
                position: absolute;
                top: -40px;
                right: -40px;
                width: 160px;
                height: 160px;
                background: rgba(255, 255, 255, 0.06);
                border-radius: 50%;
                pointer-events: none;
            }

            #validation .ssm-business-label {
                position: relative;
                z-index: 1;
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 4px;
                color: #9fb6e8;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.14em;
                text-transform: uppercase;
            }

            #validation .ssm-business-name {
                position: relative;
                z-index: 1;
                margin: 0;
                color: var(--ssm-white);
                font-size: 26px;
                font-weight: 650;
                line-height: 1.25;
                letter-spacing: -0.01em;
                font-variant-ligatures: none;
                overflow-wrap: anywhere;
            }

            #validation .ssm-card-body {
                padding: 26px 32px 30px;
            }

            #validation .ssm-info-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 14px 16px;
            }

            #validation .ssm-info-item {
                min-width: 0;
                padding: 14px 16px;
                background: var(--ssm-paper);
                border: 1px solid #eaeff7;
                border-radius: 12px;
            }

            #validation .ssm-info-label {
                display: flex;
                align-items: start;
                gap: 6px;
                margin-bottom: 6px;
                color: var(--ssm-slate-500);
                font-size: 10.5px;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }

            #validation .ssm-info-value {
                display: block;
                color: var(--ssm-navy-950);
                font-size: 15px;
                font-weight: 560;
                line-height: 1.4;
                letter-spacing: -0.005em;
                overflow-wrap: anywhere;
            }

            #validation .ssm-info-value.ssm-mono {
                font-size: 15px;
                letter-spacing: 0.01em;
            }

            #validation .ssm-info-value.is-empty {
                color: var(--ssm-slate-300);
                font-weight: 500;
            }

            #validation .ssm-status-value {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                font-weight: 600;
            }

            #validation .ssm-status-value::before {
                content: "";
                width: 7px;
                height: 7px;
                flex: 0 0 7px;
                background: var(--ssm-slate-300);
                border-radius: 50%;
                box-shadow: 0 0 0 3px rgba(199, 209, 224, 0.22);
            }

            #validation .ssm-status-value.is-active {
                color: #0f7a45;
            }

            #validation .ssm-status-value.is-active::before {
                background: #22c55e;
                box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
            }

            #validation .ssm-status-value.is-expired {
                color: #c62828;
            }

            #validation .ssm-status-value.is-expired::before {
                background: #ef4444;
                box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.18);
            }

            #validation .ssm-fallback-message {
                margin-top: 12px;
                padding: 14px 16px;
                color: #7a4b00;
                background: #fff7e6;
                border: 1px solid #f2d49a;
                border-radius: 10px;
                font-size: 14px;
                line-height: 1.5;
            }

            .business-name.ssm-manual-mode {
                display: block !important;
            }

            .wpf_html_content_wrapper[condition_id="custom_html"].ssm-force-hidden {
                display: none !important;
            }

            .form-check.ssm-forced-payment-option,
            .form-check.ssm-forced-payment-option * {
                cursor: not-allowed !important;
                user-select: none;
            }

            @media (max-width: 685px) {
                #validation .ssm-business-section {
                    padding: 22px 20px 21px;
                }

                #validation .ssm-business-name {
                    font-size: 21px;
                }

                #validation .ssm-card-body {
                    padding: 20px;
                }

                #validation .ssm-info-grid {
                    grid-template-columns: 1fr;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function escapeHtml(value) {
        const element = document.createElement("div");
        element.textContent = String(value ?? "");
        return element.innerHTML;
    }

    function displayValue(value) {
        const cleanedValue = String(value ?? "").trim();
        return cleanedValue || "—";
    }

    function isEmptyDisplayValue(value) {
        return displayValue(value) === "—";
    }

    function setPaymatticFieldValue(field, value) {
        const nativeValueSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )?.set;

        if (nativeValueSetter) nativeValueSetter.call(field, value);
        else field.value = value;

        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function setBusinessNameValue(value, source, associatedNumber) {
        settingBusinessNameProgrammatically = true;
        setPaymatticFieldValue(businessNameField, value);
        settingBusinessNameProgrammatically = false;
        businessNameSource = source || "";
        businessNameAssociatedNumber = associatedNumber || "";
    }

    function setVerificationMarker(value) {
        setPaymatticFieldValue(verificationMarkerField, value);
    }

    function setCheckboxChecked(field, checked) {
        const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "checked"
        )?.set;

        if (nativeCheckedSetter) nativeCheckedSetter.call(field, checked);
        else field.checked = checked;

        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function setExpiredMessageHidden(hidden) {
        const messageWrapper = document.querySelector(
            '.wpf_html_content_wrapper[condition_id="custom_html"]'
        );

        if (!messageWrapper) return;

        messageWrapper.classList.toggle("ssm-force-hidden", hidden);
    }

    function getExpiredPaymentOption() {
        const checkbox = document.getElementById("payment_item_1_0_1196");

        return {
            checkbox,
            wrapper: checkbox ? checkbox.closest(".form-check") : null
        };
    }

    function syncExpiredCheckbox() {
        const { checkbox, wrapper } = getExpiredPaymentOption();

        if (!checkbox || checkbox.dataset.ssmForced !== "1") return;

        if (wrapper) {
            wrapper.classList.add("ssm-forced-payment-option");
            wrapper.setAttribute("aria-disabled", "true");
        }

        checkbox.setAttribute("aria-disabled", "true");
        checkbox.tabIndex = -1;

        if (!checkbox.checked) {
            setCheckboxChecked(checkbox, true);
        }

        setExpiredMessageHidden(true);
    }

    function installExpiredCheckboxGuard() {
        if (expiredCheckboxGuardInstalled) return;

        expiredCheckboxGuardInstalled = true;

        function isForcedPaymentArea(event) {
            const { checkbox, wrapper } = getExpiredPaymentOption();

            if (!checkbox || checkbox.dataset.ssmForced !== "1") {
                return false;
            }

            return (
                event.target === checkbox ||
                (wrapper && wrapper.contains(event.target))
            );
        }

        function blockForcedPaymentToggle(event) {
            if (!isForcedPaymentArea(event)) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            queueMicrotask(syncExpiredCheckbox);
        }

        document.addEventListener(
            "pointerdown",
            blockForcedPaymentToggle,
            true
        );
        document.addEventListener(
            "mousedown",
            blockForcedPaymentToggle,
            true
        );
        document.addEventListener("click", blockForcedPaymentToggle, true);

        document.addEventListener(
            "keydown",
            function (event) {
                if (event.key !== " " && event.key !== "Enter") return;
                blockForcedPaymentToggle(event);
            },
            true
        );

        document.addEventListener(
            "change",
            function (event) {
                const { checkbox } = getExpiredPaymentOption();

                if (
                    !checkbox ||
                    event.target !== checkbox ||
                    checkbox.dataset.ssmForced !== "1" ||
                    checkbox.checked
                ) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                queueMicrotask(syncExpiredCheckbox);
            },
            true
        );
    }

    function forceExpiredCheckbox(isExpired) {
        installExpiredCheckboxGuard();

        const { checkbox, wrapper } = getExpiredPaymentOption();

        if (!checkbox) return;

        if (isExpired) {
            if (checkbox.dataset.ssmForced !== "1") {
                checkbox.dataset.ssmPreviousChecked = checkbox.checked
                    ? "1"
                    : "0";
                checkbox.dataset.ssmPreviousTabIndex = String(
                    checkbox.tabIndex
                );
            }

            checkbox.dataset.ssmForced = "1";
            syncExpiredCheckbox();
            return;
        }

        if (checkbox.dataset.ssmForced === "1") {
            const previousChecked =
                checkbox.dataset.ssmPreviousChecked === "1";
            const previousTabIndex = Number(
                checkbox.dataset.ssmPreviousTabIndex ?? 0
            );

            checkbox.dataset.ssmForced = "0";
            checkbox.removeAttribute("aria-disabled");
            checkbox.tabIndex = Number.isNaN(previousTabIndex)
                ? 0
                : previousTabIndex;

            delete checkbox.dataset.ssmPreviousChecked;
            delete checkbox.dataset.ssmPreviousTabIndex;

            if (wrapper) {
                wrapper.classList.remove("ssm-forced-payment-option");
                wrapper.removeAttribute("aria-disabled");
            }

            setCheckboxChecked(checkbox, previousChecked);
        }

        setExpiredMessageHidden(false);
    }

    function equalizeInfoLabelHeights() {
        const labels = errorContainer.querySelectorAll(".ssm-info-label");

        labels.forEach(function (label) {
            label.style.minHeight = "";
        });

        if (window.matchMedia("(max-width: 685px)").matches) return;

        let maximumHeight = 0;

        labels.forEach(function (label) {
            maximumHeight = Math.max(
                maximumHeight,
                label.getBoundingClientRect().height
            );
        });

        labels.forEach(function (label) {
            label.style.minHeight = `${Math.ceil(maximumHeight)}px`;
        });
    }

    function renderVerificationCard(responseData) {
        const info = responseData.data || {};
        const entityName = displayValue(info.entityName);
        const registrationNumber = displayValue(info.registrationNumber);
        const newRegistrationNumber = displayValue(
            info.newRegistrationNumber
        );
        const status = displayValue(info.status);
        const upperStatus = status.toUpperCase();
        const isExpired = /\bEXPIRED\b/.test(upperStatus);
        const isActive =
            /\bACTIVE\b/.test(upperStatus) &&
            !/\bINACTIVE\b/.test(upperStatus);
        const statusClass = isExpired
            ? "is-expired"
            : isActive
                ? "is-active"
                : "";
        const newRegistrationClass = isEmptyDisplayValue(
            info.newRegistrationNumber
        )
            ? " is-empty"
            : "";
        const registrationClass = isEmptyDisplayValue(
            info.registrationNumber
        )
            ? " is-empty"
            : "";

        forceExpiredCheckbox(isExpired);
        errorContainer.style.color = "";

        errorContainer.innerHTML = `
            <div class="ssm-card-panel">
                <div class="ssm-business-section">
                    <span class="ssm-business-label">Business Profile</span>
                    <div class="ssm-business-name">${escapeHtml(entityName)}</div>
                </div>
                <div class="ssm-card-body">
                    <div class="ssm-info-grid">
                        <div class="ssm-info-item">
                            <span class="ssm-info-label">New Registration Number</span>
                            <span class="ssm-info-value ssm-mono${newRegistrationClass}">${escapeHtml(newRegistrationNumber)}</span>
                        </div>
                        <div class="ssm-info-item">
                            <span class="ssm-info-label">Old Registration Number</span>
                            <span class="ssm-info-value ssm-mono${registrationClass}">${escapeHtml(registrationNumber)}</span>
                        </div>
                        <div class="ssm-info-item">
                            <span class="ssm-info-label">Status</span>
                            <span class="ssm-info-value ssm-status-value ${statusClass}">${escapeHtml(status)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        requestAnimationFrame(equalizeInfoLabelHeights);
    }

    function renderFallbackMessage(message) {
        errorContainer.style.color = "";
        errorContainer.innerHTML = `
            <div class="ssm-fallback-message">
                ${escapeHtml(message)}
            </div>
        `;
    }

    function getApiRegistrationNumber(value) {
        const cleanedValue = String(value ?? "").trim().toUpperCase();

        if (/^\d{12}$/.test(cleanedValue)) return cleanedValue;

        const oldNumberMatch = cleanedValue.match(
            /^([A-Z0-9]{9})(?:-[A-Z]?)?$/
        );

        if (!oldNumberMatch) return "";

        const baseNumber = oldNumberMatch[1];

        if (/^\d{9}$/.test(baseNumber)) return baseNumber;
        if (/^[A-Z]\d{8}$/.test(baseNumber)) return baseNumber;
        if (/^[A-Z]{2}\d{7}$/.test(baseNumber)) return baseNumber;

        return "";
    }

    function setBusinessNameManualMode(enabled) {
		const businessNameLabel = businessNameWrapper.querySelector(
			".wpf_input_label label"
		);

		let requiredSign = businessNameWrapper.querySelector(
			".ssm-business-name-required-sign"
		);

		businessNameWrapper.classList.toggle(
			"ssm-manual-mode",
			enabled
		);

		if (enabled) {
			businessNameField.required = true;
			businessNameField.setAttribute("required", "required");
			businessNameField.setAttribute("data-required", "yes");
			businessNameField.setAttribute("aria-required", "true");

			if (businessNameLabel && !requiredSign) {
				requiredSign = document.createElement("span");

				requiredSign.className =
					"wpf_required_sign wpf_required_sign_left " +
					"ssm-business-name-required-sign";

				requiredSign.textContent = "*";
				requiredSign.setAttribute("aria-hidden", "true");

				requiredSign.style.color = "red";
				requiredSign.style.marginLeft = "4px";

				businessNameLabel.appendChild(requiredSign);
			}

			return;
		}

		businessNameField.required = false;
		businessNameField.removeAttribute("required");
		businessNameField.setAttribute("data-required", "no");
		businessNameField.removeAttribute("aria-required");

		if (requiredSign) {
			requiredSign.remove();
		}
	}

    function clearOldRegistration() {
        setPaymatticFieldValue(oldRegistrationField, "");
        oldRegistrationText.textContent = "";
    }

    function clearBusinessName() {
        setBusinessNameValue("", "", "");
    }

    function setOldRegistration(value) {
        const oldNumber = String(value ?? "").trim();

        setPaymatticFieldValue(oldRegistrationField, oldNumber);
        oldRegistrationText.textContent = oldNumber
            ? `Old Registration Number: ${oldNumber}`
            : "";
    }

    function applyVerifiedMode(data, normalizedValue) {
        currentMode = "verified";
        isValidNumber = true;
        lastCheckedValue = normalizedValue;
        lastProcessedValue = normalizedValue;

        setBusinessNameManualMode(false);
        setBusinessNameValue(
            data.data?.entityName || "",
            "api",
            normalizedValue
        );
        setOldRegistration(data.data?.registrationNumber || "");
        setVerificationMarker("Verified");
        renderVerificationCard(data);

        inputField.classList.remove("loading", "invalid");
        inputField.classList.add("valid");
    }

    function applyNotFoundMode(message) {
        currentMode = "not_found";
        isValidNumber = false;
        lastCheckedValue = "";
        lastProcessedValue = getApiRegistrationNumber(inputField.value);

        setBusinessNameManualMode(false);
        clearBusinessName();
        clearOldRegistration();
        setVerificationMarker("");
        forceExpiredCheckbox(false);

        errorContainer.textContent =
            message ||
            "Registration Number doesn't exist, please make sure it is NON SDN BHD.";
        errorContainer.style.color = "red";

        inputField.classList.remove("loading", "valid");
        inputField.classList.add("invalid");
    }

    function applyFallbackMode(data, normalizedValue) {
        currentMode = "fallback";
        isValidNumber = Boolean(normalizedValue);
        lastCheckedValue = "";
        lastProcessedValue = normalizedValue;

        setBusinessNameManualMode(true);
        setVerificationMarker("Unverified");
        forceExpiredCheckbox(false);

        const returnedOldNumber = String(
            data.data?.registrationNumber || ""
        ).trim();

        if (returnedOldNumber) {
            setOldRegistration(returnedOldNumber);
        }

        errorContainer.textContent = "";
		errorContainer.style.color = "";

        inputField.classList.remove("loading", "invalid");
        if (normalizedValue) inputField.classList.add("valid");
    }

    function applyInvalidFormatMode(message) {
        isValidNumber = false;
        lastCheckedValue = "";
        setVerificationMarker(currentMode === "fallback" ? "Unverified" : "");

        errorContainer.textContent =
            message || "Please enter a valid registration number format.";
        errorContainer.style.color = "red";

        inputField.classList.remove("loading", "valid");
        inputField.classList.add("invalid");
    }

    function clearValuesForChangedNumber(normalizedValue) {
        clearOldRegistration();
        forceExpiredCheckbox(false);
        setVerificationMarker(currentMode === "fallback" ? "Unverified" : "");

        const manualBelongsToAnotherNumber =
            businessNameSource === "manual" &&
            businessNameAssociatedNumber &&
            normalizedValue &&
            businessNameAssociatedNumber !== normalizedValue;

        if (businessNameSource === "api" || manualBelongsToAnotherNumber) {
            clearBusinessName();
        }

        if (currentMode !== "fallback") {
            setBusinessNameManualMode(false);
        }
    }

    function handleServerResponse(data, normalizedValue) {
        switch (data.mode) {
            case "verified":
                applyVerifiedMode(data, normalizedValue);
                return true;

            case "not_found":
                applyNotFoundMode(data.message);
                return false;

            case "fallback":
                applyFallbackMode(data, normalizedValue);
                return true;

            case "invalid_format":
            default:
                applyInvalidFormatMode(data.message);
                return false;
        }
    }

    async function checkRegistrationNumber() {
		const enteredValue = inputField.value.trim();
		const value = getApiRegistrationNumber(enteredValue);

		if (!enteredValue) {
			isValidNumber = false;

			errorContainer.textContent =
				"Please enter a registration number";

			errorContainer.style.color = "red";

			clearValuesForChangedNumber("");

			inputField.classList.remove(
				"loading",
				"valid"
			);

			inputField.classList.add("invalid");

			submitButton.disabled = false;
			checkingValue = "";

			return false;
		}

		if (!value) {
			applyInvalidFormatMode(
				"Please enter a valid registration number format."
			);

			checkingValue = "";

			return false;
		}

		if (
			value === checkingValue ||
			(
				value === lastProcessedValue &&
				currentMode !== "idle"
			)
		) {
			return (
				currentMode === "verified" ||
				currentMode === "fallback"
			);
		}

		checkingValue = value;

		if (currentRequest) {
			currentRequest.abort();
		}

		const requestController =
			new AbortController();

		currentRequest =
			requestController;

		/*
		 * Important:
		 * This lets us tell the difference between:
		 *
		 * 1. We aborted because the user changed the SSM number.
		 * 2. We aborted because the API took more than 10 seconds.
		 */
		let requestTimedOut = false;

		const timeoutTimer = setTimeout(
			function () {
				/*
				 * Only timeout if this request is still
				 * the active SSM request.
				 */
				if (
					requestController === currentRequest
				) {
					requestTimedOut = true;

					requestController.abort();
				}
			},
			SSM_LOOKUP_TIMEOUT_MS
		);

		inputField.classList.remove(
			"valid",
			"invalid"
		);

		inputField.classList.add("loading");

		errorContainer.textContent = "";

		submitButton.disabled = true;

		try {
			const formData = new FormData();

			formData.append(
				"action",
				"check_ssm"
			);

			formData.append(
				"number",
				value
			);

			const response = await fetch(
				ssm_ajax.ajax_url,
				{
					method: "POST",
					body: formData,
					credentials: "same-origin",
					signal: requestController.signal
				}
			);

			if (!response.ok) {
				throw new Error(
					`SSM request failed with status ${response.status}`
				);
			}

			const data =
				await response.json();

			const latestValue =
				getApiRegistrationNumber(
					inputField.value
				);

			/*
			 * Do not use an old response if the
			 * customer has changed the SSM number.
			 */
			if (
				requestController !== currentRequest ||
				latestValue !== value
			) {
				return false;
			}

			checkingValue = "";

			return handleServerResponse(
				data,
				value
			);
		} catch (error) {
			/*
			 * Normal AbortError:
			 * user changed the SSM number.
			 *
			 * Do NOT switch to fallback mode.
			 */
			if (
				error.name === "AbortError" &&
				!requestTimedOut
			) {
				return false;
			}

			checkingValue = "";

			/*
			 * API has been loading for 10 seconds.
			 *
			 * Stop waiting and allow manual fallback.
			 */
			if (requestTimedOut) {
				console.warn(
					"SSM lookup exceeded 10 seconds. Switching to Unverified fallback mode."
				);

				applyFallbackMode(
					{
						mode: "fallback",
						data: null
					},
					value
				);

				return true;
			}

			/*
			 * Other network/API errors also use
			 * the existing fallback behavior.
			 */
			console.error(
				"SSM API check failed:",
				error
			);

			applyFallbackMode(
				{
					mode: "fallback",
					data: null
				},
				value
			);

			return true;
		} finally {
			/*
			 * Always cancel the 10-second timer
			 * once this request has finished.
			 */
			clearTimeout(timeoutTimer);

			if (
				requestController === currentRequest
			) {
				currentRequest = null;

				submitButton.disabled = false;
			}
		}
	}

    function showSubmissionError(message, field) {
        errorContainer.textContent = message;
        errorContainer.style.color = "red";

        if (field) field.focus();
    }

    function validateBeforeSubmission(event) {
        const normalizedValue = getApiRegistrationNumber(inputField.value);

        if (currentRequest || inputField.classList.contains("loading")) {
            event.preventDefault();
            showSubmissionError(
                "Please wait while the SSM number is being checked.",
                inputField
            );
            return false;
        }

        if (!normalizedValue) {
            event.preventDefault();
            showSubmissionError(
                "Please enter a valid registration number before submitting.",
                inputField
            );
            return false;
        }

        if (currentMode === "fallback") {
            const manualBusinessName = businessNameField.value.trim();

            if (!manualBusinessName) {
                event.preventDefault();
                showSubmissionError(
                    "Please enter the Business Name before submitting.",
                    businessNameField
                );
                return false;
            }

            setVerificationMarker("Unverified");
            return true;
        }

        if (currentMode !== "verified" || !isValidNumber) {
            event.preventDefault();
            showSubmissionError(
                "Please enter a valid registration number before submitting.",
                inputField
            );
            return false;
        }

        setVerificationMarker("Verified");
        return true;
    }

    addVerificationCardStyles();
    setBusinessNameManualMode(false);
    setVerificationMarker("");

    businessNameField.addEventListener("input", function () {
        if (settingBusinessNameProgrammatically) return;

        if (currentMode === "fallback") {
            businessNameSource = "manual";
            businessNameAssociatedNumber = getApiRegistrationNumber(
                inputField.value
            );
        }
    });

    inputField.addEventListener("input", function () {
        clearTimeout(debounceTimer);

        const currentValue = getApiRegistrationNumber(inputField.value);

        if (currentValue !== lastObservedValue) {
            clearValuesForChangedNumber(currentValue);
            lastObservedValue = currentValue;
            isValidNumber = false;
            lastCheckedValue = "";
            lastProcessedValue = "";
            errorContainer.textContent = "";
            inputField.classList.remove("valid", "invalid");
        }

        if (currentRequest && currentValue !== checkingValue) {
            currentRequest.abort();
            currentRequest = null;
            checkingValue = "";
            submitButton.disabled = false;
            inputField.classList.remove("loading");
        }

        debounceTimer = setTimeout(checkRegistrationNumber, 1000);
    });

    inputField.addEventListener("blur", function () {
        clearTimeout(debounceTimer);

        const currentValue = getApiRegistrationNumber(inputField.value);

        if (
            currentValue &&
            (currentMode !== "verified" ||
                currentValue !== lastCheckedValue) &&
            currentValue !== checkingValue
        ) {
            checkRegistrationNumber();
        }
    });

    submitButton.addEventListener("click", validateBeforeSubmission, true);

    if (form) {
        form.addEventListener("submit", validateBeforeSubmission, true);
    }
});
