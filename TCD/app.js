// Import the necessary Firebase services
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { initCrossSearch } from '../banki-bites/cross-search.js';

const crossSearch = initCrossSearch({
    noResultsEl: document.getElementById('noResults'),
    getSearchTerm: () => document.getElementById('searchBar')?.value || ''
});

// Initialize cart array to store selected items
let cart = JSON.parse(localStorage.getItem(lsKey('cart'))) || [];

const searchBar = document.getElementById('searchBar');
const clearSearchButton = document.getElementById('clearSearch');

// Scrolls the shortcuts grid horizontally to center the active chip.
// Uses container.scrollTo (not scrollIntoView) so the main page never scrolls.
const scrollChipIntoView = (chip) => {
    const grid = document.querySelector('.shortcuts-grid');
    if (!grid) return;
    const target = chip.offsetLeft - (grid.clientWidth - chip.offsetWidth) / 2;
    grid.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
};

// When a chip click triggers programmatic page scroll, suppress the scroll-spy
// for 1 s so the animation doesn't cycle through every in-between category.
let _spyIgnore = false;
let _spyIgnoreTimer = null;

// Announce cart changes to screen readers
const announceCart = (dishName, qty) => {
    const el = document.getElementById('cartAnnouncer');
    if (!el) return;
    el.textContent = '';
    requestAnimationFrame(() => {
        el.textContent = qty === 0 ? `${dishName} removed from cart` : `${dishName} — ${qty} in cart`;
    });
};

// Animate the navbar cart badge on every add
const popCartBadge = () => {
    const badge = document.querySelector('.cart-count');
    badge.classList.remove('pop');
    void badge.offsetWidth; // force reflow to restart animation
    badge.classList.add('pop');
};

// Returns current quantity of a dish in cart (0 if not present)
const getItemQty = (categoryName, dishId) => {
    const categoryInCart = cart.find(item => item.category.name === categoryName);
    if (categoryInCart) {
        const dish = categoryInCart.category.dish_details.find(d => d.id === dishId);
        return dish ? dish.quantity : 0;
    }
    return 0;
};

const updateCartCount = () => {
    const cartCount = document.querySelector('.cart-count');
    if (!cart || cart.length === 0) {
        cartCount.textContent = 0;
        updateViewCartBar();
        return;
    }
    const totalQty = cart.reduce((sum, categoryItem) => {
        if (categoryItem.category && Array.isArray(categoryItem.category.dish_details)) {
            return sum + categoryItem.category.dish_details.reduce((s, d) => s + d.quantity, 0);
        }
        return sum;
    }, 0);
    cartCount.textContent = totalQty;
    const cartButton = document.querySelector('.cart-icon');
    if (cartButton) {
        cartButton.setAttribute('aria-label', `View cart — ${totalQty} item${totalQty !== 1 ? 's' : ''}`);
    }
    updateViewCartBar();
};



// Mutates cart quantity by delta (+1 / -1); removes dish/category when qty hits 0
const updateItemQty = (subcategory, dish, delta) => {
    const existingCategory = cart.find(item => item.category.name === subcategory.name);
    if (existingCategory) {
        const existingDish = existingCategory.category.dish_details.find(d => d.id === dish.id);
        if (existingDish) {
            existingDish.quantity += delta;
            if (existingDish.quantity <= 0) {
                existingCategory.category.dish_details = existingCategory.category.dish_details.filter(d => d.id !== dish.id);
                if (existingCategory.category.dish_details.length === 0) {
                    cart.splice(cart.indexOf(existingCategory), 1);
                }
            }
        } else if (delta > 0) {
            existingCategory.category.dish_details.push({
                id: dish.id, name: dish.name, type: subcategory.type,
                price: dish.price, quantity: 1, image_src: get_dish_url(dish.name)
            });
        }
    } else if (delta > 0) {
        cart.push({
            category: {
                name: subcategory.name,
                dish_details: [{
                    id: dish.id, name: dish.name, type: subcategory.type,
                    price: dish.price, quantity: 1, image_src: get_dish_url(dish.name)
                }]
            }
        });
    }
    localStorage.setItem(lsKey('cart'), JSON.stringify(cart));
    updateCartCount();
};

// Formats an hour-of-day (0–24) as "11 AM" / "12 PM"
const formatHour = (h) => {
    const hr = ((h + 11) % 12) + 1;
    const suffix = h < 12 || h === 24 ? 'AM' : 'PM';
    return `${hr} ${suffix}`;
};

// Renders ADD bar or full-width qty stepper below the dish card
const renderControl = (container, subcategory, dish, announce = false, unavailableNote = '') => {
    const qty = getItemQty(subcategory.name, dish.id);
    container.classList.toggle('in-cart', qty > 0);
    container.classList.toggle('unavailable', !!unavailableNote);
    if (announce) announceCart(dish.name, qty);
    if (qty === 0) {
        if (unavailableNote) {
            container.innerHTML = `<span class="add-btn unavailable" aria-label="Available ${unavailableNote.toLowerCase()}">🕒 ${unavailableNote}</span>`;
            return;
        }
        container.innerHTML = `<button class="add-btn" aria-label="Add ${dish.name} to cart">+ ADD</button>`;
        container.querySelector('.add-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            updateItemQty(subcategory, dish, 1);
            popCartBadge();
            renderControl(container, subcategory, dish, true);
            container.querySelectorAll('.qty-btn')[1]?.focus();
        });
    } else {
        container.innerHTML = `
            <div class="qty-stepper" role="group" aria-label="Quantity for ${dish.name}">
                <button class="qty-btn" aria-label="Remove one ${dish.name}">&#8722;</button>
                <span class="qty-display" aria-live="polite" aria-atomic="true">${qty}</span>
                <button class="qty-btn" aria-label="Add one more ${dish.name}">+</button>
            </div>`;
        const [decBtn, incBtn] = container.querySelectorAll('.qty-btn');
        decBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            updateItemQty(subcategory, dish, -1);
            popCartBadge();
            const newQty = getItemQty(subcategory.name, dish.id);
            renderControl(container, subcategory, dish, true);
            (newQty === 0
                ? container.querySelector('.add-btn')
                : container.querySelectorAll('.qty-btn')[0]
            )?.focus();
        });
        incBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            updateItemQty(subcategory, dish, 1);
            popCartBadge();
            renderControl(container, subcategory, dish, true);
            container.querySelectorAll('.qty-btn')[1]?.focus();
        });
    }
};

const updateViewCartBar = () => {
    const bar = document.getElementById('viewCartBar');
    if (!bar) return;
    const totalQty = cart.reduce((sum, cat) =>
        sum + cat.category.dish_details.reduce((s, d) => s + d.quantity, 0), 0);
    const totalPrice = cart.reduce((sum, cat) =>
        sum + cat.category.dish_details.reduce((s, d) => s + d.price * d.quantity, 0), 0);
    const fdEl = document.getElementById('vcbFreeDelivery');
    if (totalQty === 0) {
        bar.classList.remove('visible');
        if (fdEl) fdEl.innerHTML = '';
    } else {
        bar.classList.add('visible');
        document.getElementById('vcbCount').textContent = `${totalQty} item${totalQty !== 1 ? 's' : ''}`;
        document.getElementById('vcbTotal').textContent = `₹${totalPrice.toFixed(0)}`;
        if (fdEl) {
            const minOrder = (typeof RESTAURANT !== 'undefined' && RESTAURANT.minOrder) ? RESTAURANT.minOrder : 200;
            const table = localStorage.getItem(lsKey('table'));
            // Only surface delivery hint for delivery (COD) orders — dine-in has no delivery fee
            if (table === 'COD') {
                if (totalPrice >= minOrder) {
                    fdEl.innerHTML = '<span class="vcb-fd-ico" aria-hidden="true"><i class="fas fa-check"></i></span>FREE delivery unlocked!';
                } else {
                    const remaining = minOrder - totalPrice;
                    fdEl.innerHTML = `<span class="vcb-fd-ico" aria-hidden="true"><i class="fas fa-motorcycle"></i></span>Add <strong>₹${remaining.toFixed(0)}</strong> more for <strong>FREE delivery</strong>`;
                }
            } else {
                fdEl.innerHTML = '';
            }
        }
    }
};

const syncActiveChip = () => {
    if (_spyIgnore) return;
    const stickyBar = document.querySelector('.sticky-bar');
    const threshold = stickyBar ? stickyBar.getBoundingClientRect().bottom + 8 : 180;
    let activeId = null;
    document.querySelectorAll('.category-block').forEach(block => {
        if (block.getBoundingClientRect().top <= threshold) activeId = block.id;
    });
    // On first load (page at top) no block may have crossed the threshold — default to first
    if (!activeId) {
        const first = document.querySelector('.category-block');
        if (first) activeId = first.id;
    }
    document.querySelectorAll('.shortcut-card').forEach(chip => {
        const link = chip.querySelector('a');
        const isActive = link?.getAttribute('href') === `#${activeId}`;
        const wasActive = chip.classList.contains('active');
        chip.classList.toggle('active', isActive);
        if (isActive && !wasActive) scrollChipIntoView(chip);
    });
};

let scrollSpyObserver = null;
const setupScrollSpy = () => {
    if (scrollSpyObserver) scrollSpyObserver.disconnect();
    scrollSpyObserver = new IntersectionObserver(syncActiveChip, {
        rootMargin: '-120px 0px -40% 0px',
        threshold: 0
    });
    document.querySelectorAll('.category-block').forEach(b => scrollSpyObserver.observe(b));
};

let bestsellerOnly = false;

let bestsellerNames = new Set();
const fetchBestsellers = async () => {
    try {
        const res = await fetch(`admin/tcd_order_data.json?v=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
        const dishQty = {};
        Object.values(data).forEach(order => {
            if (order.status !== 'Approved') return;
            if (order.created_at) {
                const ts = order.created_at.seconds
                    ? order.created_at.seconds * 1000
                    : new Date(order.created_at).getTime();
                if (ts < threeMonthsAgo) return;
            }
            order.order_details?.forEach(cat => {
                cat.category?.dish_details?.forEach(dish => {
                    dishQty[dish.name] = (dishQty[dish.name] || 0) + dish.quantity;
                });
            });
        });
        bestsellerNames = new Set(
            Object.entries(dishQty)
                .filter(([, qty]) => qty >= 3)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([name]) => name)
        );
    } catch { /* fail silently */ }
};

// Function to scroll to the category
const scrollToCategory = (categoryId) => {
    const categoryElement = document.getElementById(categoryId);
    if (categoryElement) {
        categoryElement.scrollIntoView({ behavior: 'smooth' });
    }
};

// Load menu data and create "Add to Cart" buttons
document.addEventListener('DOMContentLoaded', async() => {
    showLoader(); // Show loader before starting the fetch request

    store_data();
    await checkAndAskPlace();
    updateDeliveryBadge();
    const storedExpirationTime = localStorage.getItem(lsKey('urlExpiration'));
    if (storedExpirationTime) {
        const currentTime = Date.now();
        if (currentTime <= storedExpirationTime || localStorage.getItem(lsKey('table'))==="COD") {
            document.getElementById('invoiceIcon').style.display = 'flex';
            await fetch_data();
        }
        else{
            localStorage.removeItem(lsKey('disable_item_ids'))
        }
    } else{
        localStorage.removeItem(lsKey('disable_item_ids'))
    }

    // Get disabled item ids from localStorage
    let disable_ids = localStorage.getItem(lsKey('disable_item_ids'));
    if (disable_ids === null) {
        disable_ids = [];
    } else {
        disable_ids = JSON.parse(disable_ids);
    }

    const menuContainer = document.getElementById('menu-container');
    const shortcutsContainer = document.querySelector('.shortcuts-grid'); // Get the shortcuts container

    // Load checkbox states from localStorage
    const onlyVegCheckbox = document.getElementById('vegFilter');
    const onlyNonVegCheckbox = document.getElementById('nonVegFilter');
    onlyVegCheckbox.checked = localStorage.getItem(lsKey('onlyVeg')) === 'true';
    onlyNonVegCheckbox.checked = localStorage.getItem(lsKey('onlyNonVeg')) === 'true';

    // Decide whether a dish should be rendered given current filters + availability rules
    const isDishRenderable = (dish, subcategory) => {
        if (disable_ids.includes(dish.id)) return false;
        if (Array.isArray(dish.non_available_days) &&
            dish.non_available_days.includes(new Date().getDay())) return false;
        if ((onlyVegCheckbox.checked && onlyNonVegCheckbox.checked) ||
            (!onlyVegCheckbox.checked && !onlyNonVegCheckbox.checked)) {
            // both or neither -> allow
        } else if (onlyVegCheckbox.checked && subcategory.type !== 'Veg' && subcategory.type) {
            return false;
        } else if (onlyNonVegCheckbox.checked && subcategory.type !== 'NonVeg' && subcategory.type) {
            return false;
        }
        return true;
    };

    // Compute the "not yet available / no longer available" note for a dish
    const computeUnavailableNote = (dish) => {
        const currentHour = new Date().getHours();
        if (typeof dish.available_time === 'number' && currentHour < dish.available_time) {
            return `From ${formatHour(dish.available_time)}`;
        }
        if (typeof dish.not_available_time === 'number' && currentHour >= dish.not_available_time) {
            return `Till ${formatHour(dish.not_available_time)}`;
        }
        return '';
    };

    // Build a single dish card DOM node — shared between the Offers section and the regular menu
    const buildDishCard = (dish, subcategory) => {
        const unavailableNote = computeUnavailableNote(dish);
        const menuItem = document.createElement('div');
        menuItem.classList.add('menu-item');
        if (unavailableNote) menuItem.classList.add('unavailable');
        menuItem.setAttribute('role', 'article');
        menuItem.setAttribute('aria-label',
            `${dish.name} — ${subcategory.type === 'NonVeg' ? 'Non-vegetarian' : 'Vegetarian'}, ₹${dish.price}`);
        const url = get_dish_url(dish.name);
        const isNonVeg = subcategory.type === 'NonVeg';

        const hasOffer = typeof dish.offer_price === 'number' && dish.offer_price > dish.price;
        if (dish.is_offer && !hasOffer) {
            console.warn(`[TCD] Dish "${dish.name}" is_offer=true but offer_price is missing or ≤ price; skipping strikethrough.`);
        }
        const pct = hasOffer
            ? Math.round((dish.offer_price - dish.price) / dish.offer_price * 100)
            : 0;

        const priceHtml = hasOffer
            ? `<p class="price"><span class="price-strike">₹${dish.offer_price.toFixed(0)}</span> ₹${dish.price.toFixed(0)}/-</p>`
            : `<p class="price">₹${dish.price.toFixed(0)}/-</p>`;

        menuItem.innerHTML = `
          <div class="menu-item-container">
                <div class="dish-card">
                    <img src="${url}" alt="${dish.name}" class="dish-img">
                    <div class="diet-badge ${isNonVeg ? 'nonveg' : 'veg'}" aria-label="${isNonVeg ? 'Non-vegetarian' : 'Vegetarian'}"></div>
                    ${hasOffer ? `<span class="offer-badge">${pct}% OFF</span>` : ''}
                    ${bestsellerNames.has(dish.name) ? '<span class="bestseller-badge">🔥 Bestseller</span>' : ''}
                    <div class="dish-overlay">
                        <h5 class="dish-name">${dish.name}</h5>
                        ${priceHtml}
                    </div>
                    <div class="item-control"></div>
                </div>
          </div>
        `;
        renderControl(menuItem.querySelector('.item-control'), subcategory, dish, false, unavailableNote);
        return menuItem;
    };

    // Zomato-style horizontal-rail card used only inside the Offers section
    const buildOfferRailCard = (dish, subcategory) => {
        const unavailableNote = computeUnavailableNote(dish);
        const url = get_dish_url(dish.name);
        const isNonVeg = subcategory.type === 'NonVeg';
        const pct = Math.round((dish.offer_price - dish.price) / dish.offer_price * 100);
        const savings = Math.round(dish.offer_price - dish.price);

        const card = document.createElement('article');
        card.className = 'offer-card';
        if (unavailableNote) card.classList.add('unavailable');
        card.setAttribute('role', 'listitem');
        card.setAttribute('aria-label',
            `${dish.name} — ${isNonVeg ? 'Non-vegetarian' : 'Vegetarian'}, ₹${dish.price}, ${pct}% off from ₹${dish.offer_price}`);

        card.innerHTML = `
            <div class="offer-card-media">
                <img src="${url}" alt="${dish.name}" class="offer-card-img" loading="lazy">
                <span class="offer-ribbon">
                    <span class="offer-ribbon-pct">${pct}%</span>
                    <span class="offer-ribbon-off">OFF</span>
                </span>
                <span class="offer-diet ${isNonVeg ? 'nonveg' : 'veg'}" aria-hidden="true"></span>
                ${bestsellerNames.has(dish.name) ? '<span class="offer-bestseller">🔥 Bestseller</span>' : ''}
            </div>
            <div class="offer-card-body">
                <h4 class="offer-card-name" title="${dish.name}">${dish.name}</h4>
                <div class="offer-card-price">
                    <span class="offer-price-now">₹${dish.price.toFixed(0)}</span>
                    <span class="offer-price-was">₹${dish.offer_price.toFixed(0)}</span>
                </div>
                <div class="offer-card-save">You save ₹${savings}</div>
                <div class="offer-card-control item-control"></div>
            </div>
        `;
        renderControl(card.querySelector('.item-control'), subcategory, dish, false, unavailableNote);
        return card;
    };

    const renderMenu = () => {
        menuContainer.innerHTML = ''; // Clear previous content
        fetch(`data.json?v=${new Date().getTime()}`)
            .then(response => response.json())
            .then(data => {
                // Reset shortcuts
                shortcutsContainer.innerHTML = '';

                // ── Offers section (rendered first) ──────────────────────────────
                const offerEntries = [];
                data.menu.forEach(category => {
                    category.subcategories.forEach(subcategory => {
                        subcategory.dishes.forEach(dish => {
                            if (dish.is_offer === true &&
                                typeof dish.offer_price === 'number' &&
                                dish.offer_price > dish.price &&
                                isDishRenderable(dish, subcategory)) {
                                offerEntries.push({ dish, subcategory });
                            }
                        });
                    });
                });

                if (offerEntries.length > 0) {
                    const offersSection = document.createElement('section');
                    offersSection.classList.add('offers-section', 'category-block');
                    offersSection.id = 'Offers';
                    offersSection.setAttribute('aria-labelledby', 'offers-heading');

                    offersSection.innerHTML = `
                        <div class="offers-head">
                            <div class="offers-head-text">
                                <span class="offers-eyebrow">
                                    <i class="fas fa-bolt" aria-hidden="true"></i> Limited Time
                                </span>
                                <h3 id="offers-heading" class="offers-title">Deals of the Day</h3>
                                <p class="offers-subtitle">Save big on today's most-loved picks · Prices drop when you tap add</p>
                            </div>
                            <div class="offers-count-chip" aria-hidden="true">${offerEntries.length} live</div>
                        </div>
                        <div class="offers-rail" role="list" tabindex="0" aria-label="Deals of the day, scroll horizontally"></div>
                    `;

                    const rail = offersSection.querySelector('.offers-rail');
                    offerEntries
                        .slice()
                        .sort((a, b) => {
                            const pctA = (a.dish.offer_price - a.dish.price) / a.dish.offer_price;
                            const pctB = (b.dish.offer_price - b.dish.price) / b.dish.offer_price;
                            return pctB - pctA; // biggest discount first
                        })
                        .forEach(({ dish, subcategory }) => {
                            rail.appendChild(buildOfferRailCard(dish, subcategory));
                        });

                    menuContainer.appendChild(offersSection);

                    // Shortcut chip for Offers (appears first)
                    const offersShortcut = document.createElement('div');
                    offersShortcut.classList.add('shortcut-card');
                    const offersLink = document.createElement('a');
                    offersLink.href = '#Offers';
                    offersLink.className = 'shortcut';
                    offersLink.textContent = '⚡ Deals';
                    offersLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        document.querySelectorAll('.shortcut-card').forEach(c => c.classList.remove('active'));
                        offersShortcut.classList.add('active');
                        scrollChipIntoView(offersShortcut);
                        _spyIgnore = true;
                        clearTimeout(_spyIgnoreTimer);
                        _spyIgnoreTimer = setTimeout(() => { _spyIgnore = false; }, 1000);
                        scrollToCategory('Offers');
                    });
                    offersShortcut.appendChild(offersLink);
                    shortcutsContainer.appendChild(offersShortcut);
                }

                // Render categories and dishes
                data.menu.forEach(category => {
                    const categoryBlock = document.createElement('div');
                    categoryBlock.classList.add('category-block');
                    categoryBlock.id = category.category; // Set ID for scrolling

                    const categoryTitle = document.createElement('h3');
                    categoryTitle.textContent = category.category;
                    categoryBlock.appendChild(categoryTitle);

                    let hasVisibleDishes = false; // Track if there are visible dishes in this category

                    category.subcategories.forEach(subcategory => {
                        const subcategoryBlock = document.createElement('div');
                        subcategoryBlock.classList.add('subcategory-block');

                        const subcategoryTitle = document.createElement('h4');
                        let type = '';
                        if (subcategory.type !== undefined) {
                            type = `${subcategory.name} (${subcategory.type})`;
                        } else {
                            type = `${subcategory.name}`;
                        }
                        subcategoryTitle.textContent = subcategory.name
                            ? type
                            : ''; // Set subcategory name and type, if available
                        subcategoryBlock.appendChild(subcategoryTitle);

                        const dishGrid = document.createElement('div');
                        dishGrid.classList.add('dish-grid');

                        const sortedDishes = [...subcategory.dishes].sort((a, b) => a.price - b.price);
                        sortedDishes.forEach(dish => {
                            if (!isDishRenderable(dish, subcategory)) return;
                            dishGrid.appendChild(buildDishCard(dish, subcategory));
                            hasVisibleDishes = true;
                        });

                        if (dishGrid.children.length > 0) {
                            subcategoryBlock.appendChild(dishGrid);
                            categoryBlock.appendChild(subcategoryBlock);
                        }
                    });

                    if (hasVisibleDishes) {
                        menuContainer.appendChild(categoryBlock);

                        const shortcutCard = document.createElement('div');
                        shortcutCard.classList.add('shortcut-card');
                        const shortcutLink = document.createElement('a');
                        shortcutLink.href = `#${category.category}`;
                        shortcutLink.className = 'shortcut';
                        shortcutLink.textContent = category.category;
                        shortcutLink.addEventListener('click', (e) => {
                            e.preventDefault();
                            document.querySelectorAll('.shortcut-card').forEach(c => c.classList.remove('active'));
                            shortcutCard.classList.add('active');
                            scrollChipIntoView(shortcutCard);
                            // Suppress scroll-spy for 1 s so the smooth-scroll animation
                            // doesn't cycle through every category it passes over
                            _spyIgnore = true;
                            clearTimeout(_spyIgnoreTimer);
                            _spyIgnoreTimer = setTimeout(() => { _spyIgnore = false; }, 1000);
                            scrollToCategory(category.category);
                        });
                        shortcutCard.appendChild(shortcutLink);
                        shortcutsContainer.appendChild(shortcutCard);
                    }
                });

                // Build tagline from data.json categories
                const taglineEl = document.getElementById('local-info-tagline');
                if (taglineEl && data.menu.length) {
                    const cats = data.menu.map(c => c.category).join(', ');
                    taglineEl.textContent = `Best restaurant in Banki, Cuttack district — serving ${cats} and more. Delivering to Harirajpur, Chakapada, Sisua, Bedapur, Ranapur, Charchika & nearby areas.`;
                }

                // Update cart count on page load
                updateCartCount();
                setupScrollSpy();
                syncActiveChip(); // set initial active chip without waiting for scroll
                applyFilters();
            })
            .catch(error => {
                console.error('Error fetching menu data:', error);
            })
            .finally(() => {
                hideLoader(); // Hide the loader once the data is fetched or on error
            });
    };

    await fetchBestsellers();
    const bestsellerFilterBtn = document.getElementById('bestsellerFilter');
    if (bestsellerFilterBtn) {
        bestsellerFilterBtn.style.display = bestsellerNames.size > 0 ? '' : 'none';
    }
    renderMenu(); // Initial render of menu
    updateViewCartBar();

    // Setup filter functionality
    const saveCheckboxState = () => {
        localStorage.setItem(lsKey('onlyVeg'), onlyVegCheckbox.checked);
        localStorage.setItem(lsKey('onlyNonVeg'), onlyNonVegCheckbox.checked);
        searchBar.value = ''; // Set the search bar value to empty
        renderMenu(); // Re-render menu when checkbox state changes
    };

    onlyVegCheckbox.addEventListener('change', saveCheckboxState);
    onlyNonVegCheckbox.addEventListener('change', saveCheckboxState);

    if (bestsellerFilterBtn) {
        bestsellerFilterBtn.addEventListener('click', () => {
            bestsellerOnly = !bestsellerOnly;
            bestsellerFilterBtn.classList.toggle('active', bestsellerOnly);
            bestsellerFilterBtn.setAttribute('aria-pressed', String(bestsellerOnly));
            applyFilters();
        });
    }

});

function fetch_data(){
    return get_credentials().then(credentials => {  // Return the promise here
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
        return getDocs(collection(db, decrypt_values(credentials.DB_NAME, _cfg))) // Return this promise
            .then(querySnapshot => {
                querySnapshot.forEach(doc => {
                    if (doc.data().whatsapp_no !== undefined) {
                        localStorage.setItem(lsKey('whatsapp_no'), doc.data().whatsapp_no);
                    }
                    if (doc.data().disabled_items !== undefined) {
                        localStorage.setItem(lsKey('disable_item_ids'), doc.data().disabled_items);
                    }
                    if (doc.data().shop_status !== undefined) {
                        localStorage.setItem(lsKey('shop_status'), doc.data().shop_status);
                    }
                    if (doc.data().opening_time !== undefined) {
                        localStorage.setItem(lsKey('opening_time'), doc.data().opening_time);
                    }
                    if (doc.data().closing_time !== undefined) {
                        localStorage.setItem(lsKey('closing_time'), doc.data().closing_time);
                    }
                });

                // Remove disabled dishes from the cart
                const disableIdsRaw = localStorage.getItem(lsKey('disable_item_ids'));
                const currentDisableIds = disableIdsRaw ? JSON.parse(disableIdsRaw) : [];
                cart.forEach(category => {
                    category.category.dish_details = category.category.dish_details.filter(dish => !currentDisableIds.includes(dish.id));
                });

                // Update the cart in localStorage
                localStorage.setItem(lsKey('cart'), JSON.stringify(cart));

                updateCartCount(); // Update cart count after cleaning up
            })
            .catch(error => {
                console.error("Error fetching Firestore data:", error);
            });
    });
}

function applyFilters() {
    const searchTerm = searchBar.value.toLowerCase();
    const noResultsDiv = document.getElementById('noResults');
    let anyVisibleDish = false;

    document.querySelectorAll('.category-block').forEach(categoryBlock => {
        // Offers section uses a horizontal rail instead of subcategory grids —
        // filter its .offer-card children directly and skip the subcategory loop.
        if (categoryBlock.classList.contains('offers-section')) {
            const offerCards = categoryBlock.querySelectorAll('.offer-card');
            let anyVisibleOffer = false;
            offerCards.forEach(card => {
                const dishName = card.querySelector('.offer-card-name')?.textContent.toLowerCase() || '';
                const isBestseller = !!card.querySelector('.offer-bestseller');
                const matchesSearch = !searchTerm || dishName.includes(searchTerm);
                const matchesBestseller = !bestsellerOnly || isBestseller;
                if (matchesSearch && matchesBestseller) {
                    card.style.display = '';
                    anyVisibleOffer = true;
                    anyVisibleDish = true;
                } else {
                    card.style.display = 'none';
                }
            });
            categoryBlock.style.display = anyVisibleOffer ? '' : 'none';
            return;
        }

        let hasVisibleInCategory = false;
        categoryBlock.querySelectorAll('.subcategory-block').forEach(subcategoryBlock => {
            const dishGrid = subcategoryBlock.querySelector('.dish-grid');
            const dishes = dishGrid ? dishGrid.querySelectorAll('.menu-item') : [];
            let hasVisibleInSubcategory = false;
            const subcategoryName = subcategoryBlock.querySelector('h4')?.textContent.toLowerCase() || '';
            const subcategoryMatchesSearch = searchTerm && subcategoryName.includes(searchTerm);

            dishes.forEach(dish => {
                const dishName = dish.querySelector('h5')?.textContent.toLowerCase() || '';
                const isBestseller = !!dish.querySelector('.bestseller-badge');
                const matchesSearch = !searchTerm || subcategoryMatchesSearch || dishName.includes(searchTerm);
                const matchesBestseller = !bestsellerOnly || isBestseller;

                if (matchesSearch && matchesBestseller) {
                    dish.style.display = '';
                    hasVisibleInSubcategory = true;
                    anyVisibleDish = true;
                } else {
                    dish.style.display = 'none';
                }
            });

            subcategoryBlock.style.display = hasVisibleInSubcategory ? '' : 'none';
            if (hasVisibleInSubcategory) hasVisibleInCategory = true;
        });
        categoryBlock.style.display = hasVisibleInCategory ? '' : 'none';
    });

    if (noResultsDiv) noResultsDiv.style.display = anyVisibleDish ? 'none' : 'block';
    if (anyVisibleDish) crossSearch.clear(); else crossSearch.update();

    const shortcutsGrid = document.querySelector('.shortcuts-grid');
    if (searchTerm) {
        if (shortcutsGrid) shortcutsGrid.style.display = 'none';
        document.querySelectorAll('.shortcut-card').forEach(c => c.classList.remove('active'));
    } else {
        if (shortcutsGrid) shortcutsGrid.style.display = '';
        if (!bestsellerOnly) syncActiveChip();
        else document.querySelectorAll('.shortcut-card').forEach(c => c.classList.remove('active'));
    }
}

searchBar.addEventListener('input', function () {
    clearSearchButton.style.display = searchBar.value ? 'block' : 'none';
    applyFilters();
});

// Clear the search bar when the clear button is clicked
clearSearchButton.addEventListener('click', function() {
    searchBar.value = '';
    clearSearchButton.style.display = 'none';
    applyFilters();
    searchBar.focus();
});
