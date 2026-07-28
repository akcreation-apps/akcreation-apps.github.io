function get_dish_url(dish_name) {
    // Split the string into words by spaces, then join with an underscore
    return 'src/'+dish_name.split(' ').join('_')+'.webp';
}

async function get_credentials() {
    try {
        // Fetch the JSON file
        const response = await fetch(`credentials.json?v=${new Date().getTime()}`);

        // Check if the fetch was successful
        if (!response.ok) {
            throw new Error('Network response was not ok ' + response.statusText);
        }

        // Parse the JSON data
        const data = await response.json();

        return data; // Return the data
    } catch (error) {
        console.error('There was a problem with the fetch operation:', error);
        return null; // Return null or handle the error as needed
    }
}

function showLoader() {
    document.body.classList.add('is-loading');
    document.getElementById('loaderOverlay').style.display = 'flex';
}

function hideLoader() {
    document.getElementById('loaderOverlay').style.display = 'none';
    document.body.classList.remove('is-loading');
    const footer = document.querySelector('footer');
    const cartBar = document.getElementById('viewCartBar');
    if (footer) footer.style.visibility = '';
    if (cartBar) cartBar.style.visibility = '';
}

function store_data(){
    const urlParams = new URLSearchParams(window.location.search);
    const table_no = urlParams.get('table');
    if(table_no){
        localStorage.setItem(lsKey('table'), table_no);
        if (/^\d+$/.test(table_no)) {
            // Numeric table → Dine-In session, set place immediately
            localStorage.setItem(lsKey('place'), 'Dine-In');
            localStorage.removeItem(lsKey('place_custom'));
        } else {
            // Non-numeric (COD, etc.)
            const existingPlace = localStorage.getItem(lsKey('place'));
            if (existingPlace === 'Dine-In') {
                // Switching from a dine-in session — clear stale Dine-In so location is asked
                localStorage.removeItem(lsKey('place'));
            }
            // Any real delivery location already stored → keep it untouched
        }
        const expirationTime = Date.now() + 60 * 60 * 1000;
        localStorage.setItem(lsKey('urlExpiration'), expirationTime);
        window.location.href = window.location.protocol + "//" + window.location.host + window.location.pathname;
    }
}

// Sorts the place-chip buttons inside the modal alphabetically by their
// visible label, while keeping the "Other" chip pinned as the last option.
// Idempotent — safe to call every time the picker opens.
function sortPlaceChips() {
    const grid = document.getElementById('placeOptionsList');
    if (!grid) return;
    const chips = Array.from(grid.querySelectorAll('.place-chip'));
    chips.sort((a, b) => {
        const aOther = a.classList.contains('other-chip');
        const bOther = b.classList.contains('other-chip');
        if (aOther !== bOther) return aOther ? 1 : -1;
        return (a.dataset.value || '').localeCompare(b.dataset.value || '', undefined, { sensitivity: 'base' });
    });
    chips.forEach(chip => grid.appendChild(chip));
}

// Opens the place picker modal. Optionally pre-selects `currentPlace`.
// Tapping a chip closes immediately; "Other" reveals an inline input+tick.
// dismissible=true allows Escape/overlay-click to close (used for the "Change" flow).
// triggerEl is the element to return focus to on close.
// Returns a Promise that resolves with the chosen place string (or null if dismissed).
function openPlacePicker(currentPlace = '', title = 'Where are you ordering from?', dismissible = false, triggerEl = null) {
    return new Promise(resolve => {
        const modal = document.getElementById('placeModal');
        const titleEl = document.getElementById('placeModalTitle');
        sortPlaceChips();
        const options = modal.querySelectorAll('.place-chip');
        const otherWrapper = document.getElementById('placeOtherWrapper');
        const otherInput = document.getElementById('placeOtherInput');
        const otherConfirm = document.getElementById('placeOtherConfirm');
        const errorMsg = document.getElementById('placeError');

        // Reset UI
        if (titleEl) titleEl.textContent = title;
        options.forEach(o => {
            o.classList.remove('selected');
            o.setAttribute('aria-pressed', 'false');
        });
        otherWrapper.style.display = 'none';
        otherInput.value = '';
        errorMsg.style.display = 'none';

        // Pre-select current value if it exists in the list
        if (currentPlace) {
            let found = false;
            options.forEach(opt => {
                if (opt.dataset.value === currentPlace) {
                    opt.classList.add('selected');
                    opt.setAttribute('aria-pressed', 'true');
                    found = true;
                }
            });
            if (!found) {
                const otherOpt = modal.querySelector('.place-chip[data-value="Other"]');
                if (otherOpt) {
                    otherOpt.classList.add('selected');
                    otherOpt.setAttribute('aria-pressed', 'true');
                    otherInput.value = currentPlace;
                    otherWrapper.style.display = 'block';
                }
            }
        }

        modal.style.display = 'flex';
        const firstSelected = modal.querySelector('.place-chip.selected') || modal.querySelector('.place-chip');
        if (firstSelected) firstSelected.focus();

        const ac = new AbortController();
        const sig = { signal: ac.signal };

        function closeModal(result) {
            modal.style.display = 'none';
            ac.abort();
            if (triggerEl) triggerEl.focus();
            resolve(result);
        }

        function confirmOther() {
            const custom = otherInput.value.trim();
            if (!custom) {
                errorMsg.textContent = 'Please enter your location.';
                errorMsg.style.display = 'block';
                otherInput.focus();
                return;
            }
            localStorage.setItem(lsKey('place'), custom);
            localStorage.setItem(lsKey('place_custom'), '1');
            closeModal(custom);
        }

        options.forEach(opt => {
            opt.addEventListener('click', () => {
                const value = opt.dataset.value;
                options.forEach(o => {
                    o.classList.remove('selected');
                    o.setAttribute('aria-pressed', 'false');
                });
                opt.classList.add('selected');
                opt.setAttribute('aria-pressed', 'true');

                if (value === 'Other') {
                    otherWrapper.style.display = 'block';
                    errorMsg.style.display = 'none';
                    otherInput.focus();
                } else {
                    otherWrapper.style.display = 'none';
                    errorMsg.style.display = 'none';
                    localStorage.setItem(lsKey('place'), value);
                    localStorage.removeItem(lsKey('place_custom'));
                    closeModal(value);
                }
            }, sig);
        });

        otherConfirm.addEventListener('click', confirmOther, sig);
        otherInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); confirmOther(); }
        }, sig);

        // Focus trap — keep Tab/Shift+Tab cycling within the modal
        modal.addEventListener('keydown', e => {
            if (e.key === 'Escape' && dismissible) {
                e.preventDefault();
                closeModal(null);
                return;
            }
            if (e.key !== 'Tab') return;
            const focusable = Array.from(modal.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), [tabindex="0"]'
            )).filter(el => el.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last.focus(); }
            } else {
                if (document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        }, sig);

        if (dismissible) {
            modal.addEventListener('click', e => {
                if (e.target === modal) closeModal(null);
            }, sig);
        }
    });
}

// Bakery order picker — mandatory Event dropdown + optional Name-on-Cake input.
// Non-dismissible: Continue stays disabled until Event is chosen. Only shown
// once per session; use openBakeryOrderPicker(true) to force-reopen (edit flow).
function openBakeryOrderPicker(dismissible = false) {
    return new Promise(resolve => {
        const modal = document.getElementById('bakeryOrderModal');
        if (!modal) { resolve(null); return; }
        const eventSel = document.getElementById('bakeryEventSelect');
        const nameInput = document.getElementById('bakeryNameInput');
        const submitBtn = document.getElementById('bakerySubmitBtn');

        // Populate events (alphabetical) — clear old options after the placeholder
        while (eventSel.options.length > 1) eventSel.remove(1);
        const events = (typeof BAKERY_EVENTS !== 'undefined' ? BAKERY_EVENTS : []);
        events.forEach(evt => {
            const opt = document.createElement('option');
            opt.value = evt; opt.textContent = evt;
            eventSel.appendChild(opt);
        });
        // Append "Other" so users can type an unlisted occasion
        const otherOpt = document.createElement('option');
        otherOpt.value = '__other__'; otherOpt.textContent = 'Other (specify)';
        eventSel.appendChild(otherOpt);

        // Inject the custom-event input just under the select (idempotent)
        const eventField = eventSel.closest('.bakery-field');
        let otherInput = document.getElementById('bakeryEventOtherInput');
        if (!otherInput) {
            otherInput = document.createElement('input');
            otherInput.type = 'text';
            otherInput.id = 'bakeryEventOtherInput';
            otherInput.className = 'bakery-input';
            otherInput.placeholder = 'Type your occasion…';
            otherInput.maxLength = 40;
            otherInput.autocomplete = 'off';
            otherInput.style.marginTop = '8px';
            otherInput.style.display = 'none';
            eventField.appendChild(otherInput);
        }

        // Prefill from existing storage (edit flow). If saved value isn't in the
        // canonical list, drive the picker into the "Other" branch and prefill.
        const savedEvent = localStorage.getItem(lsKey('bakery_event')) || '';
        const savedName = localStorage.getItem(lsKey('bakery_name_on_cake')) || '';
        const isKnown = events.includes(savedEvent);
        if (savedEvent && !isKnown) {
            eventSel.value = '__other__';
            otherInput.value = savedEvent;
            otherInput.style.display = '';
        } else {
            eventSel.value = savedEvent || '';
            otherInput.value = '';
            otherInput.style.display = 'none';
        }
        nameInput.value = savedName;

        const currentEventValue = () =>
            eventSel.value === '__other__' ? otherInput.value.trim() : eventSel.value;
        const refreshSubmit = () => { submitBtn.disabled = !currentEventValue(); };
        refreshSubmit();

        modal.style.display = 'flex';
        setTimeout(() => eventSel.focus(), 30);

        const ac = new AbortController();
        const sig = { signal: ac.signal };

        function close(result) {
            modal.style.display = 'none';
            ac.abort();
            resolve(result);
        }

        eventSel.addEventListener('change', () => {
            if (eventSel.value === '__other__') {
                otherInput.style.display = '';
                setTimeout(() => otherInput.focus(), 30);
            } else {
                otherInput.style.display = 'none';
                otherInput.value = '';
            }
            refreshSubmit();
        }, sig);

        otherInput.addEventListener('input', refreshSubmit, sig);

        submitBtn.addEventListener('click', () => {
            const value = currentEventValue();
            if (!value) {
                (eventSel.value === '__other__' ? otherInput : eventSel).focus();
                return;
            }
            localStorage.setItem(lsKey('bakery_event'), value);
            localStorage.setItem(lsKey('bakery_name_on_cake'), nameInput.value.trim());
            close(value);
        }, sig);

        modal.addEventListener('keydown', e => {
            if (e.key === 'Escape' && dismissible) { e.preventDefault(); close(null); }
        }, sig);

        if (dismissible) {
            modal.addEventListener('click', e => {
                if (e.target === modal) close(null);
            }, sig);
        }
    });
}

function checkAndAskPlace() {
    const table = localStorage.getItem(lsKey('table'));
    const place = localStorage.getItem(lsKey('place'));
    if (!table) return Promise.resolve();

    if (/^\d+$/.test(table)) {
        localStorage.setItem(lsKey('place'), 'Dine-In');
        localStorage.removeItem(lsKey('place_custom'));
        return Promise.resolve();
    }

    // COD path — need place, then bakery event details
    const needsPlace = !place;
    const needsBakery = !localStorage.getItem(lsKey('bakery_event'));
    if (!needsPlace && !needsBakery) return Promise.resolve();

    hideLoader();
    let chain = Promise.resolve();
    if (needsPlace) {
        chain = chain.then(() => openPlacePicker('', 'Where are you ordering from?', false));
    }
    if (needsBakery) {
        chain = chain.then(() => openBakeryOrderPicker(false));
    }
    return chain.then(() => { showLoader(); });
}

function updateDeliveryBadge() {
    const place = localStorage.getItem(lsKey('place'));
    const table = localStorage.getItem(lsKey('table'));
    const strip = document.getElementById('deliveryStrip');
    if (!strip || !place || !table) return;
    const isDineIn = place === 'Dine-In';
    const bakeryEvent = localStorage.getItem(lsKey('bakery_event')) || '';
    const nameOnCake = localStorage.getItem(lsKey('bakery_name_on_cake')) || '';

    const bakeryRow = (!isDineIn && bakeryEvent)
        ? `<div class="ds-bakery">
             <i class="fas fa-birthday-cake ds-icon" aria-hidden="true"></i>
             <span><strong>${bakeryEvent}</strong>${nameOnCake ? ` · ${nameOnCake}` : ''}</span>
             <button class="ds-change" id="dsBakeryChangeBtn" aria-label="Change event / name on cake">
                 Edit <i class="fas fa-pen" style="font-size:0.55rem" aria-hidden="true"></i>
             </button>
           </div>`
        : '';

    strip.innerHTML = `<div class="delivery-strip-inner">
        <i class="fas ${isDineIn ? 'fa-utensils' : 'fa-map-marker-alt'} ds-icon" aria-hidden="true"></i>
        ${isDineIn
            ? `<span class="ds-place">Table&nbsp;${table}&nbsp;&middot;&nbsp;Dine-In</span>`
            : `<span class="ds-label">Delivering&nbsp;to</span>
               <span class="ds-place">${place}</span>
               <button class="ds-change" id="dsChangeBtn" aria-label="Change delivery location">
                   Change <i class="fas fa-pen" style="font-size:0.55rem" aria-hidden="true"></i>
               </button>`
        }
    </div>${bakeryRow}`;
    strip.style.display = 'block';

    document.getElementById('dsChangeBtn')?.addEventListener('click', async function() {
        const current = localStorage.getItem(lsKey('place')) || '';
        await openPlacePicker(current, 'Change delivery location', true, this);
        updateDeliveryBadge();
    });
    document.getElementById('dsBakeryChangeBtn')?.addEventListener('click', async function() {
        await openBakeryOrderPicker(true);
        updateDeliveryBadge();
    });
}

// Full-screen image preview for cake designs. Lightbox element is created
// lazily on first call so index.html doesn't need extra markup.
function openImageLightbox(imgUrl, altText) {
    let lb = document.getElementById('imgLightbox');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'imgLightbox';
        lb.className = 'img-lightbox';
        lb.setAttribute('role', 'dialog');
        lb.setAttribute('aria-modal', 'true');
        lb.setAttribute('aria-label', 'Cake image preview');
        lb.innerHTML = `
            <button type="button" class="img-lightbox-close" aria-label="Close preview">&times;</button>
            <img class="img-lightbox-img" alt="" />
        `;
        document.body.appendChild(lb);
        const close = () => {
            lb.classList.remove('open');
            document.body.style.overflow = '';
        };
        lb.addEventListener('click', (e) => {
            if (e.target === lb || e.target.classList.contains('img-lightbox-close')) close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lb.classList.contains('open')) close();
        });
    }
    const imgEl = lb.querySelector('.img-lightbox-img');
    imgEl.src = imgUrl;
    imgEl.alt = altText || '';
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function redirect_to_home(){
    window.location.href = 'index.html';
}

function redirect_to_invoice(){
    window.location.href = 'invoice.html';
}

function redirect_to_cart(){
    window.location.href = 'cart.html';
}

var _cfg = RESTAURANT.encKey;

function decrypt_values(value, key){
    const decryptedBytes = CryptoJS.AES.decrypt(value, key);
    return decryptedBytes.toString(CryptoJS.enc.Utf8);
}
