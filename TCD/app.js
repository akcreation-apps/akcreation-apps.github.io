// Import the necessary Firebase services
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

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

// Renders ADD bar or full-width qty stepper below the dish card
const renderControl = (container, subcategory, dish, announce = false) => {
    const qty = getItemQty(subcategory.name, dish.id);
    container.classList.toggle('in-cart', qty > 0);
    if (announce) announceCart(dish.name, qty);
    if (qty === 0) {
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
    if (totalQty === 0) {
        bar.classList.remove('visible');
    } else {
        bar.classList.add('visible');
        document.getElementById('vcbCount').textContent = `${totalQty} item${totalQty !== 1 ? 's' : ''}`;
        document.getElementById('vcbTotal').textContent = `₹${totalPrice.toFixed(0)}`;
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

    const renderMenu = () => {
        menuContainer.innerHTML = ''; // Clear previous content
        fetch(`data.json?v=${new Date().getTime()}`)
            .then(response => response.json())
            .then(data => {
                // Reset shortcuts
                shortcutsContainer.innerHTML = '';

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

                        subcategory.dishes.forEach(dish => {
                            // Skip rendering the dish if its id is in disable_ids
                            if (disable_ids.includes(dish.id)) {
                                return; // Skip the disabled dish
                            }

                            // Filter logic: Show items with no subcategory type or based on filters
                            if ((onlyVegCheckbox.checked && onlyNonVegCheckbox.checked) ||
                                (!onlyVegCheckbox.checked && !onlyNonVegCheckbox.checked)) {
                                // Both checkboxes are checked (or none), show all items
                            } else if (onlyVegCheckbox.checked && subcategory.type !== 'Veg' && subcategory.type) {
                                return; // Filter out non-Veg items if Veg is checked
                            } else if (onlyNonVegCheckbox.checked && subcategory.type !== 'NonVeg' && subcategory.type) {
                                return; // Filter out Veg items if Non-Veg is checked
                            }

                            const menuItem = document.createElement('div');
                            menuItem.classList.add('menu-item');
                            menuItem.setAttribute('role', 'article');
                            menuItem.setAttribute('aria-label', `${dish.name} — ${subcategory.type === 'NonVeg' ? 'Non-vegetarian' : 'Vegetarian'}, ₹${dish.price}`);
                            const url = get_dish_url(dish.name);
                            const isNonVeg = subcategory.type === 'NonVeg';
                            menuItem.innerHTML = `
                              <div class="menu-item-container">
                                    <div class="dish-card">
                                        <img src="${url}" alt="${dish.name}" class="dish-img">
                                        <div class="diet-badge ${isNonVeg ? 'nonveg' : 'veg'}" aria-label="${isNonVeg ? 'Non-vegetarian' : 'Vegetarian'}"></div>
                                        ${bestsellerNames.has(dish.name) ? '<span class="bestseller-badge">🔥 Bestseller</span>' : ''}
                                        <div class="dish-overlay">
                                            <h5 class="dish-name">${dish.name}</h5>
                                            <p class="price">₹${dish.price.toFixed(0)}/-</p>
                                        </div>
                                        <div class="item-control"></div>
                                    </div>
                              </div>
                            `;
                            renderControl(menuItem.querySelector('.item-control'), subcategory, dish);

                            dishGrid.appendChild(menuItem);
                            hasVisibleDishes = true; // Mark that there's at least one visible dish
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
