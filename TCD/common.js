function get_dish_url(dish_name) {
    // Split the string into words by spaces, then join with an underscore
    return '../food_src/'+dish_name.split(' ').join('_')+'.webp';
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
    document.getElementById('loaderOverlay').style.display = 'flex';
}

function hideLoader() {
    document.getElementById('loaderOverlay').style.display = 'none';
}

function store_data(){
    const urlParams = new URLSearchParams(window.location.search);
    const table_no = urlParams.get('table');
    if(table_no){
        localStorage.setItem('table', table_no)
        localStorage.removeItem('place'); // reset place on new table scan
        const expirationTime = Date.now() + 60 * 60 * 1000; // 30 minutes from now
        localStorage.setItem('tcd_urlExpiration', expirationTime);
        window.location.href = window.location.protocol + "//" + window.location.host + window.location.pathname;
    }
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
            localStorage.setItem('place', custom);
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
                    localStorage.setItem('place', value);
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

function checkAndAskPlace() {
    const table = localStorage.getItem('table');
    const place = localStorage.getItem('place');
    if (!table || place) return Promise.resolve();

    if (/^\d+$/.test(table)) {
        localStorage.setItem('place', 'Dine-In');
        return Promise.resolve();
    }

    hideLoader();
    return openPlacePicker('', 'Where are you ordering from?', false).then(() => { showLoader(); });
}

function updateDeliveryBadge() {
    const place = localStorage.getItem('place');
    const table = localStorage.getItem('table');
    const strip = document.getElementById('deliveryStrip');
    if (!strip || !place || !table) return;
    const isDineIn = place === 'Dine-In';

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
    </div>`;
    strip.style.display = 'block';

    document.getElementById('dsChangeBtn')?.addEventListener('click', async function() {
        const current = localStorage.getItem('place') || '';
        await openPlacePicker(current, 'Change delivery location', true, this);
        updateDeliveryBadge();
    });
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

function decrypt_values(value, key){
    const decryptedBytes = CryptoJS.AES.decrypt(value, key);
    return decryptedBytes.toString(CryptoJS.enc.Utf8);
}