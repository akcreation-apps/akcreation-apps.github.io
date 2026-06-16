// Firebase is loaded LAZILY (dynamic import inside collect_data) so a gstatic
// outage or any module-load failure can never block the customer from
// reaching WhatsApp. The customer's order can be recovered later via the
// admin sync icon if the Firestore write didn't happen.
let _firebaseModulePromise = null;
function _getFirebase() {
    if (!_firebaseModulePromise) {
        _firebaseModulePromise = Promise.all([
            import('https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js'),
            import('https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js'),
        ]).then(([appMod, fsMod]) => ({
            initializeApp: appMod.initializeApp,
            getFirestore: fsMod.getFirestore,
            collection: fsMod.collection,
            addDoc: fsMod.addDoc,
            Timestamp: fsMod.Timestamp,
        }));
    }
    return _firebaseModulePromise;
}

// Mirror is loaded LAZILY via dynamic import. A static import here would
// crash module evaluation (and silently disable the place-order button) if
// order-mirror.js were missing, syntactically broken, or its own gstatic
// imports failed. Wrapping in a dynamic import guarantees the customer's
// WhatsApp flow keeps working even when the mirror itself is broken.
let _mirrorModulePromise = null;
function _getMirror() {
    if (!_mirrorModulePromise) {
        _mirrorModulePromise = import('../banki-bites/order-mirror.js').catch(err => {
            console.warn('BankiBites mirror module failed to load:', err);
            return null;
        });
    }
    return _mirrorModulePromise;
}
_getMirror().then(m => { try { m && m.warmMirrorConnection && m.warmMirrorConnection(); } catch (e) {} });

// Defensive RESTAURANT access. If restaurant.js failed to load, we still
// produce a usable cart.js so the customer can reach WhatsApp on the
// restaurant's fallback number. Values mirror MCH/restaurant.js exactly.
const _RESTAURANT = (typeof RESTAURANT !== 'undefined' && RESTAURANT) || {};
const BACKUP_WP_NO = _RESTAURANT.wpFallback || '+917749984274';
const MINIMUM_ORDER_PRICE = _RESTAURANT.minOrder || 200;
const DELIVERY_CHARGES = _RESTAURANT.deliveryCharge || 50;
// Safe lsKey — never throws. Uses the global `lsKey` if it's a working
// function; otherwise (or if calling it throws) falls back to the
// restaurant's hardcoded prefix so cart.js stays usable.
const _safeLsKey = (k => {
    try {
        if (typeof lsKey === 'function') return lsKey(k);
    } catch (e) { /* fall through to local fallback */ }
    return (_RESTAURANT.prefix || 'mch') + '_' + k;
});
// Retrieve the cart from localStorage. Wrapped because corrupted JSON or a
// SecurityError reading localStorage would otherwise halt module evaluation,
// which means the place-order click handler would never attach and the
// button would silently do nothing.
let cart;
try {
    cart = JSON.parse(localStorage.getItem(_safeLsKey('cart'))) || [];
} catch (e) {
    cart = [];
}

// Render the cart items on the cart page
const renderCartItems = () => {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalContainer = document.getElementById('cart-total-container');
    const emptyCartBanner = document.getElementById('empty-cart-banner');

    cartItemsContainer.innerHTML = ''; // Clear the container before rendering

    if (cart.length === 0) {
        // Show the empty cart banner
        emptyCartBanner.style.display = 'block';
        cartTotalContainer.style.display = 'none'; // Hide total and button
    } else {
        // Hide the empty cart banner
        emptyCartBanner.style.display = 'none';
        cartTotalContainer.style.display = 'block'; // Show total and button

        // Loop through each category in the cart
        cart.forEach((categoryItem, categoryIndex) => {
            // Loop through each dish in the category
            categoryItem.category.dish_details.forEach((dishItem, dishIndex) => {
                const cartItem = document.createElement('div');
                cartItem.classList.add('cart-item');
                const url = get_dish_url(dishItem.name);

                cartItem.innerHTML = `
                    <img src="${url}" alt="${dishItem.name}">
                    <div class="cart-item-info">
                        <h5>
                          <span class="cart-diet-badge ${dishItem.type === 'NonVeg' ? 'nonveg' : 'veg'}"></span>
                          ${dishItem.name} (${categoryItem.category.name})
                        </h5>
                        <p class="cart-item-price">₹${dishItem.price.toFixed(0)} <span class="price-x">×</span> ${dishItem.quantity} = <strong>₹${(dishItem.price * dishItem.quantity).toFixed(0)}</strong></p>
                    </div>
                    <div class="cart-item-controls">
                        <div class="cart-item-quantity">
                            <button class="decrease-quantity" data-category-index="${categoryIndex}" data-dish-index="${dishIndex}">-</button>
                            <span class="quantity">${dishItem.quantity}</span>
                            <button class="increase-quantity" data-category-index="${categoryIndex}" data-dish-index="${dishIndex}">+</button>
                        </div>
                        <button class="delete-item" data-category-index="${categoryIndex}" data-dish-index="${dishIndex}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;

                // Append event listeners for increase, decrease, and delete buttons
                cartItem.querySelector('.increase-quantity').addEventListener('click', () => {
                    dishItem.quantity += 1;
                    updateCartStorage();
                    renderCartItems(); // Re-render cart items to reflect changes
                });

                cartItem.querySelector('.decrease-quantity').addEventListener('click', () => {
                    if (dishItem.quantity > 1) {
                        dishItem.quantity -= 1;
                        updateCartStorage();
                        renderCartItems(); // Re-render cart items to reflect changes
                    }
                });

                cartItem.querySelector('.delete-item').addEventListener('click', () => {
                    Swal.fire({
                        title: 'Confirm Delete!',
                        html: 'Want to remove this item from your cart?',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Yes',
                        cancelButtonText: 'No',
                    }).then((result) => {
                        if (result.isConfirmed) {
                            // Remove the dish from the category
                            categoryItem.category.dish_details.splice(dishIndex, 1);

                            // If the category becomes empty, remove the category
                            if (categoryItem.category.dish_details.length === 0) {
                                cart.splice(categoryIndex, 1);
                            }

                            updateCartStorage();
                            renderCartItems(); // Re-render cart items to reflect changes
                        }
                    });
                });

                cartItemsContainer.appendChild(cartItem);
            });
        });
    }

    updateTotalPrice();
};


// COD-only: surface the estimated arrival time as the Place Order button's
// sub-text. For dine-in / empty cart, falls back to "via WhatsApp".
// Driven by RESTAURANT.etaMinutes; refreshed on every cart change and on a
// 30s ticker so the displayed clock stays current.
const updateEtaRow = () => {
    const btn = document.getElementById('place-order-btn');
    const chip = document.getElementById('place-order-eta');
    const timeEl = document.getElementById('place-order-sub');
    if (!btn || !chip || !timeEl) return;
    const table = (() => { try { return localStorage.getItem(_safeLsKey('table')); } catch (e) { return null; } })();
    const hasItems = Array.isArray(cart) && cart.some(c => (c.category?.dish_details || []).some(d => (d.quantity || 0) > 0));
    if (table !== 'COD' || !hasItems) {
        btn.classList.remove('eta-on');
        return;
    }
    const mins = (typeof RESTAURANT !== 'undefined' && Number(RESTAURANT.etaMinutes)) || 60;
    let rel, clock;
    try {
        clock = new Date(Date.now() + mins * 60 * 1000)
            .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        rel = `~${mins} min`;
    } catch (e) {
        btn.classList.remove('eta-on');
        return;
    }
    const fullLabel = `${rel} · ${clock}`;
    const changed = chip.dataset.label !== fullLabel;
    if (changed) {
        chip.dataset.label = fullLabel;
        timeEl.innerHTML =
            `<span class="eta-rel">${rel}</span>` +
            `<span class="eta-sep"> · </span>` +
            `<span class="eta-abs">${clock}</span>`;
    }
    btn.classList.add('eta-on');
    if (changed) {
        chip.classList.remove('is-shimmer');
        void chip.offsetWidth; // force reflow so the animation restarts
        chip.classList.add('is-shimmer');
    }
};

// Calculate and update the total price
const updateTotalPrice = () => {
    const totalPriceElement = document.getElementById('cart-total');
    const deliveryNoteElement = document.getElementById('delivery-note');
    let total = 0;

    // Iterate through each category and dish to calculate the total price
    cart.forEach(categoryItem => {
        categoryItem.category.dish_details.forEach(dishItem => {
            total += dishItem.price * dishItem.quantity;
        });
    });
    const table = localStorage.getItem(_safeLsKey('table'));

    if (table === 'COD') {
        if (total > 0 && total < MINIMUM_ORDER_PRICE) {
            deliveryNoteElement.innerHTML = `
                <span style="color:red;">₹${DELIVERY_CHARGES} delivery charge added for orders below ₹${MINIMUM_ORDER_PRICE}.</span><br>
                Current Total: ₹${total.toFixed(0)} <br>
                Delivery Charges: ₹${DELIVERY_CHARGES}
            `;
            total += DELIVERY_CHARGES;
        } else if (total >= MINIMUM_ORDER_PRICE) {
            deliveryNoteElement.innerHTML = `
                <span style="color:green;">🎉 Free delivery on orders above ₹${MINIMUM_ORDER_PRICE}!</span>
            `;
        } else {
            deliveryNoteElement.textContent = ""; // Empty cart
        }
    }

    // Update the displayed total price
    totalPriceElement.textContent = `₹${total.toFixed(0)}`;
    updateEtaRow();
};


// Update session storage whenever cart changes
const updateCartStorage = () => {
    localStorage.setItem(_safeLsKey('cart'), JSON.stringify(cart));
};

// Load the cart items when the cart page is opened
document.addEventListener('DOMContentLoaded', () => {
    showLoader();
    const storedExpirationTime = localStorage.getItem(_safeLsKey('urlExpiration'));
    if (storedExpirationTime) {
        const currentTime = Date.now();
        if (currentTime < storedExpirationTime || localStorage.getItem(_safeLsKey('table'))==="COD") {
            document.getElementById('invoiceIcon').style.display = 'flex';
        }
    }
    renderCartItems();
    updateDeliveryBadge();
    updateEtaRow();
    setInterval(updateEtaRow, 30000);
    hideLoader();
});


// common.js

// Function to get cart items from local storage
function getCartItems() {
    const cart = JSON.parse(localStorage.getItem(_safeLsKey('cart'))) || [];
    return cart;
}

// Function to create the order message string
function createOrderMessage(cartItems) {
    const now = new Date();
    const orderId =
      now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0');
    let message = `*${_RESTAURANT.name || 'Order'}*\nHello, I would like to place an order for the following items:\n\n`;
    message += "Ordered ID: "+orderId+"\n\n";
    message += "Ordered Items:\n\n";

    // Create an object to group items by category
    const categoryMap = {};

    cartItems.forEach(item => {
        const categoryName = item.category.name; // Get the category name

        // Initialize the category in the map if it doesn't exist
        if (!categoryMap[categoryName]) {
            categoryMap[categoryName] = [];
        }

        // Iterate through the dish details to add dishes to the corresponding category
        item.category.dish_details.forEach(dish => {
            const dishId = dish.id; // Get the dish name
            const dishName = dish.type === "NonVeg" ? `${dish.name} (Non-Veg)` : dish.name; // Get the dish name
            const quantity = dish.quantity; // Get the quantity
            const price = dish.price; // Get the price

            // Find if the dish already exists in this category
            const existingDish = categoryMap[categoryName].find(d => d.id === dishId);

            if (existingDish) {
                // If it exists, update the quantity
                existingDish.quantity += quantity;
            } else {
                // If it doesn't exist, add it to the category
                categoryMap[categoryName].push({ name: dishName, quantity: quantity, price: price });
            }
        });
    });

    // Build the message with categories and their dishes
    for (const category in categoryMap) {
        message += `*${category}:*\n`; // Add category header

        categoryMap[category].forEach(dish => {
            message += `  - ${dish.name} (${dish.quantity}x) - ₹${dish.quantity*dish.price}/-\n`; // List each dish under the category
        });

        message += '\n'; // Add a new line after each category
    }
    message = calculateTotal(cartItems, message)
    return message; // Return the constructed message
}


// Function to calculate total amount
function calculateTotal(cartItems, message) {
    let total = cartItems.reduce((total, categoryItem) => {
        // Iterate through each dish detail in the category
        return total + categoryItem.category.dish_details.reduce((categoryTotal, dish) => {
            // Sum up the price of each dish multiplied by its quantity
            return categoryTotal + (dish.price * dish.quantity);
        }, 0);
    }, 0);
    let deliveryNote = "";
    const table = localStorage.getItem(_safeLsKey('table'));

    const place = localStorage.getItem(_safeLsKey('place')) || '';
    if (table === 'COD') {
        // Apply delivery charge if below 200
        if (total > 0 && total < MINIMUM_ORDER_PRICE) {
            total += DELIVERY_CHARGES;
            deliveryNote = `\n(₹${DELIVERY_CHARGES} delivery charge applied for orders below ₹${MINIMUM_ORDER_PRICE})`;
        }
        const placeNote = place ? `\nDelivering at: ${place}` : '';
        message += `Total Price: ₹${total.toFixed(0)}/-\n${deliveryNote}${placeNote}\nPayment Mode: Cash On Delivery\n\n`;
        message += `*Note: If your order remains unseen for 5 mins, please call us.*`;
    } else {
        message += `Total Price: ₹${total.toFixed(0)}/-\n${deliveryNote}\nTable Number: ${table}`;
    }

    return message;
}

// Function to send message via WhatsApp
function sendWhatsAppMessage(message, phoneNumber) {
    const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.location.href = url;
}

// Event listener for the "Place Order" button.
// Null-check so a missing button in the DOM can't halt module evaluation.
const placeOrderButton = document.getElementById('place-order-btn');
if (placeOrderButton) placeOrderButton.addEventListener('click', async () => {
    // Defensive accessors — every external call here must be unable to crash
    // the handler. Customer must always reach the WhatsApp landing.
    const _loaderShow = () => { try { showLoader(); } catch (e) {} };
    const _loaderHide = () => { try { hideLoader(); } catch (e) {} };
    const _lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const _lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    const _lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
    _loaderShow();

    let cartItems;
    try { cartItems = getCartItems(); } catch (e) { cartItems = []; }

    const storedExpirationTime = _lsGet(_safeLsKey('urlExpiration'));
    const storedShopStatus = _lsGet(_safeLsKey('shop_status'));
    const storedOpeningTime = _lsGet(_safeLsKey('opening_time'));
    const storedClosingTime = _lsGet(_safeLsKey('closing_time'));
    const currentHour = new Date().getHours();
    if (storedExpirationTime && _lsGet(_safeLsKey('table'))!=="COD") {
        const currentTime = Date.now();
        if (currentTime >= storedExpirationTime) {
            Swal.fire('Error', 'The URL is expired. Please rescan the QR.', 'error');
            _loaderHide();
            return;
        }
    } else if(!storedExpirationTime){
        Swal.fire('Access Required', 'Please use your ordering link to place an order.', 'info');
        _loaderHide();
        return;
    }
    if (storedShopStatus ==="closed") {
        Swal.fire('We\'re currently closed 🛑','Our shop is taking a break right now. Please check back when we\'re open!', 'info');
        _loaderHide();
        return;
    }
    // Check if current time is outside operating hours
    if (storedOpeningTime !== null && storedClosingTime !== null &&
        (currentHour < storedOpeningTime || currentHour >= storedClosingTime)) {
        Swal.fire(
            'We’re taking a break 😊',
            `Our kitchen is open from ${storedOpeningTime}:00 to ${storedClosingTime}:00. Please visit us during these hours!`,
            'info'
        );
        _loaderHide();
        return;
    }
    if (cartItems.length === 0) {
        Swal.fire('Error', 'Your cart is empty.', 'error').then(() => {
            location.reload(); // Reload the page after clicking OK
        });
        _loaderHide();
        return;
    }
    const today = new Date().toDateString();
    const lastOrderDate = _lsGet(_safeLsKey('order_date'));
    let ordersToday = parseInt(_lsGet(_safeLsKey('order_count')) || '0', 10);
    if (lastOrderDate && lastOrderDate !== today) {
        _lsDel(_safeLsKey('order_date'));
        _lsDel(_safeLsKey('order_count'));
        ordersToday = 0;
    }
    if (ordersToday >= 5) {
        Swal.fire('Daily Limit Reached', 'You have placed the maximum of 5 orders for today. Please try again tomorrow!', 'info');
        _loaderHide();
        return;
    }
    // Build the WhatsApp payload BEFORE any async work. Even if cart items
    // are malformed, we still want a sendable message in hand so the customer
    // is never left without a way to order.
    let orderMessage;
    try {
        orderMessage = createOrderMessage(cartItems);
    } catch (err) {
        console.error('createOrderMessage failed; falling back to raw cart:', err);
        orderMessage = `Hi, I'd like to place an order:\n\n${JSON.stringify(cartItems)}`;
    }
    const phoneNo = _lsGet(_safeLsKey('whatsapp_no')) || BACKUP_WP_NO;
    _loaderHide();

    // Two clicks total: (1) the "Place Order" button you just pressed kicks
    // off the writes behind a loader Swal; (2) the "Open WhatsApp" button on
    // the next Swal is the fresh user gesture mobile Chrome needs to launch
    // the cross-app navigation. Whatever happens to the Firestore writes
    // between the two clicks, the customer is GUARANTEED to land on
    // WhatsApp with the prefilled order message.

    const goToWhatsApp = () => {
        _lsSet(_safeLsKey('order_date'), today);
        _lsSet(_safeLsKey('order_count'), ordersToday + 1);
        try {
            const onReturn = () => {
                if (document.visibilityState !== 'visible') return;
                document.removeEventListener('visibilitychange', onReturn);
                window.removeEventListener('pageshow', onReturn);
                location.reload();
            };
            document.addEventListener('visibilitychange', onReturn);
            window.addEventListener('pageshow', onReturn);
        } catch (e) { /* bookkeeping must never block the send */ }
        // Silent safety net for vivo / older Android where the wa.me Intent
        // sometimes drops `text` on cold-start of WhatsApp. If pre-fill fails,
        // the customer can long-press the WhatsApp input and Paste.
        try { navigator.clipboard && navigator.clipboard.writeText(orderMessage).catch(() => {}); } catch (e) {}
        const waUrl = `https://wa.me/${phoneNo}?text=${encodeURIComponent(orderMessage)}`;
        try { sendWhatsAppMessage(orderMessage, phoneNo); return; } catch (e) { /* fall through */ }
        try { window.location.href = waUrl; return; } catch (e) { /* fall through */ }
        try { window.location.assign(waUrl); return; } catch (e) { /* fall through */ }
        try { window.open(waUrl, '_self'); return; } catch (e) { /* fall through */ }
        try { window.open(waUrl, '_blank'); return; } catch (e) {}
        console.error('All navigation attempts to WhatsApp failed.');
    };

    // Cross-restaurant key — once acknowledged on any restaurant (TCD/A1/MCH),
    // the customer is treated as informed everywhere.
    const _hintAckKey = 'bankibites_hint_ack';
    const hintAcked = (() => { try { return localStorage.getItem(_hintAckKey) === 'true'; } catch (e) { return false; } })();

    try {
        // Step 1 — First-time customers see an educational popup explaining
        // the paste fallback (vivo / cold-start Intent bug where WhatsApp
        // opens blank). The "Continue" confirm stays disabled until the
        // customer ticks the acknowledgement checkbox.
        if (!hintAcked) {
            const popupHtml = `
                <div style="font-size:.92rem;line-height:1.55;text-align:left">
                    <p style="margin:0 0 .55rem;font-weight:600;color:#111827">WhatsApp will open with your order. If it shows a <u>blank message</u>:</p>
                    <ol style="margin:.25rem 0 .6rem 1.15rem;padding:0;color:#92400e">
                        <li style="margin-bottom:.25rem"><b>Long-press</b> the message box</li>
                        <li style="margin-bottom:.25rem">Tap <b>Paste</b></li>
                        <li>Tap <b>Send</b> ✅</li>
                    </ol>
                    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:.5rem .7rem;color:#92400e;font-size:.86rem;font-weight:500">
                        📋 Your order is already copied — pasting sends the exact same details.
                    </div>
                    <label style="display:flex;align-items:center;gap:.5rem;margin-top:.75rem;font-size:.88rem;color:#374151;cursor:pointer;user-select:none">
                        <input type="checkbox" id="paste-hint-ack-cb" style="width:18px;height:18px;cursor:pointer">
                        <span>Don't show this again — I've got it</span>
                    </label>
                </div>`;
            // Mandatory wait — customer MUST tick the checkbox and click
            // Continue. No timeout, no escape: the popup blocks the order
            // flow until acknowledged.
            const result = await Swal.fire({
                title: 'One last step',
                icon: 'info',
                html: popupHtml,
                confirmButtonText: 'Continue',
                confirmButtonColor: '#16a34a',
                allowOutsideClick: false,
                allowEscapeKey: false,
                focusConfirm: false,
                didOpen: () => {
                    const btn = Swal.getConfirmButton();
                    const cb  = document.getElementById('paste-hint-ack-cb');
                    const setBtnEnabled = (enabled) => {
                        if (!btn) return;
                        btn.disabled = !enabled;
                        btn.style.opacity = enabled ? '1' : '0.5';
                        btn.style.cursor  = enabled ? 'pointer' : 'not-allowed';
                        btn.style.filter  = enabled ? 'none' : 'grayscale(40%)';
                    };
                    setBtnEnabled(false);
                    if (cb) cb.addEventListener('change', () => setBtnEnabled(cb.checked));
                },
                preConfirm: () => {
                    const cb = document.getElementById('paste-hint-ack-cb');
                    if (!cb || !cb.checked) {
                        Swal.showValidationMessage('Please tick the box to confirm you understand.');
                        return false;
                    }
                    return true;
                },
            });
            // Only proceed if the customer actually confirmed (clicked
            // Continue with the checkbox ticked). Any other outcome means
            // the popup was dismissed unexpectedly — log and bail to avoid
            // saving an unconfirmed order.
            if (!result || !result.isConfirmed) {
                console.warn('Educational popup dismissed without confirmation; aborting order flow.');
                return;
            }
            try { localStorage.setItem(_hintAckKey, 'true'); } catch (e) {}
        }

        // Step 2 — Saving loader. Awaits Firestore write so the order is
        // guaranteed persisted before the customer leaves the page.
        Swal.fire({
            title: 'Saving your order…',
            html: '<div style="font-size:.9rem;color:#6b7280">Hang tight, this takes a moment.</div>',
            allowOutsideClick: false,
            allowEscapeKey: false,
            didOpen: () => Swal.showLoading(),
        });

        // Bound the save so a hung Firestore can never trap the customer on
        // the loader. The write may still complete in the background; if it
        // doesn't, the admin sync icon is the recovery path.
        await Promise.race([
            collect_data().catch(err => console.error('Order save failed (customer not notified):', err)),
            new Promise(resolve => setTimeout(resolve, 10000)),
        ]);

        // Close the loader cleanly before the next Swal — calling Swal.fire()
        // back-to-back can race and instantly dismiss the second modal on some
        // devices. Explicit close + tiny delay lets DOM settle.
        try { Swal.close(); } catch (e) {}
        await new Promise(r => setTimeout(r, 80));

        // Step 3 — Final "Open WhatsApp" confirm. The click here is the fresh
        // user-gesture mobile Chrome needs to launch the wa.me deep-link
        // without showing the api.whatsapp.com interstitial.
        await Promise.race([
            Swal.fire({
                title: 'Open WhatsApp to send your order',
                icon: 'success',
                html: '<div style="font-size:.95rem;line-height:1.5;color:#374151">Tap below — your order is ready.</div>',
                confirmButtonText: 'Open WhatsApp',
                confirmButtonColor: '#16a34a',
                allowOutsideClick: false,
                allowEscapeKey: false,
            }).catch(() => {}),
            new Promise(resolve => setTimeout(resolve, 60000)),
        ]);
    } catch (err) {
        console.error('Unexpected error in order flow (sending to WhatsApp anyway):', err);
    }

    goToWhatsApp();
});

function flattenCartForMirror(cartItems) {
    const out = [];
    (cartItems || []).forEach(cat => {
        (cat.category?.dish_details || []).forEach(d => {
            out.push({ name: d.name, qty: d.quantity, price: d.price });
        });
    });
    return out;
}

async function collect_data(){
    let order_history;
    try { order_history = JSON.parse(localStorage.getItem(_safeLsKey('order_history'))) || []; } catch (e) { order_history = []; }
    const { initializeApp, getFirestore, collection, addDoc, Timestamp } = await _getFirebase();
    const credentials = await get_credentials();
    const firebaseConfig = {
        apiKey: decrypt_values(credentials.API_KEY, _cfg),
        authDomain: decrypt_values(credentials.AUTH_DOMAIN, _cfg),
        projectId: decrypt_values(credentials.ID, _cfg),
        storageBucket: decrypt_values(credentials.STORAGE_BUCKET, _cfg),
        messagingSenderId: decrypt_values(credentials.MESSAGING_SENDER_ID, _cfg),
        appId: decrypt_values(credentials.APP_ID, _cfg),
        measurementId: decrypt_values(credentials.MEASUREMENT_ID, _cfg)
    };
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const cartTotalValue = document.getElementById('cart-total').textContent;
    const deliveryNoteValue = document.getElementById('delivery-note').textContent;
    const cartTotalNumber = parseFloat(cartTotalValue.replace(/[^0-9.-]+/g,""));
    let data = {
        'order_details':getCartItems(),
        'triggered_to':localStorage.getItem(_safeLsKey('whatsapp_no')),
        'total_cart_value':cartTotalNumber,
        'table_no':localStorage.getItem(_safeLsKey('table')),
        'mch_place':localStorage.getItem(_safeLsKey('place')) || '',
        'status':'In Progress',
        'created_at':Timestamp.now()
    };
    if (deliveryNoteValue.includes("delivery charge")) {
        data['delivery_charges'] = DELIVERY_CHARGES;
    }
    const orderTable = decrypt_values(credentials.ORDER_TABLE_NAME, _cfg);
    const docRef = await addDoc(collection(db, orderTable), data);
    order_history.push({
        'order_id': docRef.id,
        'admin_id': _cfg,
        'api_call': 'Initiated',
        'order_details': data
    });
    localStorage.setItem(_safeLsKey('order_history'), JSON.stringify(order_history));
    localStorage.removeItem(_safeLsKey('cart'));

    let mirrored = false;
    try {
        const mirror = await _getMirror();
        if (mirror && mirror.mirrorToBankiBites) {
            await mirror.mirrorToBankiBites({
                restaurant_id:   'MCH',
                restaurant_name: _RESTAURANT.name || '',
                source_doc_id:   docRef.id,
                items:           flattenCartForMirror(data.order_details),
                subtotal:        cartTotalNumber - (data.delivery_charges || 0),
                total:           cartTotalNumber,
                delivery_charges: data.delivery_charges || 0,
                place:           data.mch_place || '',
                table_no:        data.table_no || '',
                source_doc_path: `${orderTable}/${docRef.id}`,
            });
            mirrored = true;
        }
    } catch (err) {
        console.warn('BankiBites mirror failed:', err);
    }
    return { orderId: docRef.id, mirrored };
}
