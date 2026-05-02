// Import the necessary Firebase services
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

// Initialize cart array to store selected items
let cart = JSON.parse(localStorage.getItem('cart')) || [];

const searchBar = document.getElementById('searchBar');
const clearSearchButton = document.getElementById('clearSearch');

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
    localStorage.setItem('cart', JSON.stringify(cart));
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

let scrollSpyObserver = null;
const setupScrollSpy = () => {
    if (scrollSpyObserver) scrollSpyObserver.disconnect();
    scrollSpyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const id = entry.target.id;
            document.querySelectorAll('.shortcut-card').forEach(chip => {
                const link = chip.querySelector('a');
                const isActive = link?.getAttribute('href') === `#${id}`;
                chip.classList.toggle('active', isActive);
                if (isActive) chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            });
        });
    }, { rootMargin: '-180px 0px -60% 0px', threshold: 0 });
    document.querySelectorAll('.category-block').forEach(b => scrollSpyObserver.observe(b));
};

let bestsellerNames = new Set();
const fetchBestsellers = async () => {
    try {
        const res = await fetch(`admin/tcd_order_data.json?v=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        const dishQty = {};
        Object.values(data).forEach(order => {
            if (order.status !== 'Approved') return;
            order.order_details?.forEach(cat => {
                cat.category?.dish_details?.forEach(dish => {
                    dishQty[dish.name] = (dishQty[dish.name] || 0) + dish.quantity;
                });
            });
        });
        bestsellerNames = new Set(
            Object.entries(dishQty)
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
    const storedExpirationTime = localStorage.getItem('tcd_urlExpiration');
    if (storedExpirationTime) {
        const currentTime = Date.now();
        if (currentTime <= storedExpirationTime || localStorage.getItem('table')==="COD") {
            document.getElementById('invoiceIcon').style.display = 'flex';
            await fetch_data();
        }
        else{
            localStorage.removeItem('disable_item_ids')
        }
    } else{
        localStorage.removeItem('disable_item_ids')
    }

    // Get disabled item ids from localStorage
    let disable_ids = localStorage.getItem('disable_item_ids');
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
    onlyVegCheckbox.checked = localStorage.getItem('onlyVeg') === 'true';
    onlyNonVegCheckbox.checked = localStorage.getItem('onlyNonVeg') === 'true';

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
                                            <p class="price">₹${dish.price.toFixed(2)}/-</p>
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
                            scrollToCategory(category.category);
                        });
                        shortcutCard.appendChild(shortcutLink);
                        shortcutsContainer.appendChild(shortcutCard);
                    }
                });

                // Update cart count on page load
                updateCartCount();
                setupScrollSpy();
            })
            .catch(error => {
                console.error('Error fetching menu data:', error);
            })
            .finally(() => {
                hideLoader(); // Hide the loader once the data is fetched or on error
            });
    };

    await fetchBestsellers();
    renderMenu(); // Initial render of menu
    updateViewCartBar();

    // Setup filter functionality
    const saveCheckboxState = () => {
        localStorage.setItem('onlyVeg', onlyVegCheckbox.checked);
        localStorage.setItem('onlyNonVeg', onlyNonVegCheckbox.checked);
        searchBar.value = ''; // Set the search bar value to empty
        renderMenu(); // Re-render menu when checkbox state changes
    };

    onlyVegCheckbox.addEventListener('change', saveCheckboxState);
    onlyNonVegCheckbox.addEventListener('change', saveCheckboxState);

});

function fetch_data(){
    return get_credentials().then(credentials => {  // Return the promise here
        const firebaseConfig = {
            apiKey: decrypt_values(credentials.API_KEY, credentials.KEY),
            authDomain: decrypt_values(credentials.AUTH_DOMAIN, credentials.KEY),
            projectId: decrypt_values(credentials.ID, credentials.KEY),
            storageBucket: decrypt_values(credentials.STORAGE_BUCKET, credentials.KEY),
            messagingSenderId: decrypt_values(credentials.MESSAGING_SENDER_ID, credentials.KEY),
            appId: decrypt_values(credentials.APP_ID, credentials.KEY),
            measurementId: decrypt_values(credentials.MEASUREMENT_ID, credentials.KEY)
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        return getDocs(collection(db, decrypt_values(credentials.DB_NAME, credentials.KEY))) // Return this promise
            .then(querySnapshot => {
                querySnapshot.forEach(doc => {
                    if (doc.data().whatsapp_no !== undefined) {
                        localStorage.setItem('whatsapp_no', doc.data().whatsapp_no);
                    }
                    if (doc.data().disabled_items !== undefined) {
                        localStorage.setItem('disable_item_ids', doc.data().disabled_items);
                    }
                    if (doc.data().shop_status !== undefined) {
                        localStorage.setItem('shop_status', doc.data().shop_status);
                    }
                    if (doc.data().opening_time !== undefined) {
                        localStorage.setItem('opening_time', doc.data().opening_time);
                    }
                    if (doc.data().closing_time !== undefined) {
                        localStorage.setItem('closing_time', doc.data().closing_time);
                    }
                });
               
                // Remove disabled dishes from the cart
                const disableIdsRaw = localStorage.getItem('disable_item_ids');
                const currentDisableIds = disableIdsRaw ? JSON.parse(disableIdsRaw) : [];
                cart.forEach(category => {
                    category.category.dish_details = category.category.dish_details.filter(dish => !currentDisableIds.includes(dish.id));
                });

                // Update the cart in localStorage
                localStorage.setItem('cart', JSON.stringify(cart));
                
                updateCartCount(); // Update cart count after cleaning up
            })
            .catch(error => {
                console.error("Error fetching Firestore data:", error);
            });
    });
}

searchBar.addEventListener('input', function () {
    if (searchBar.value) {
        clearSearchButton.style.display = 'block'; // Show clear button
    } else {
        clearSearchButton.style.display = 'none'; // Hide clear button
    }

    const searchTerm = searchBar.value.toLowerCase(); // Get the input value
    const noResultsDiv = document.getElementById('noResults'); // Get the no results div
    let anyVisibleDish = false; // Flag to track if any dish is visible

    // Get all category blocks
    const categoryBlocks = document.querySelectorAll('.category-block');

    // Iterate through each category block
    categoryBlocks.forEach(categoryBlock => {
        const subcategoryBlocks = categoryBlock.querySelectorAll('.subcategory-block'); // Get subcategory blocks
        let hasVisibleDishesInCategory = false; // Track if any visible dishes in this category

        // Iterate through each subcategory
        subcategoryBlocks.forEach(subcategoryBlock => {
            const dishGrid = subcategoryBlock.querySelector('.dish-grid');
            const dishes = dishGrid.querySelectorAll('.menu-item');

            let hasVisibleDishesInSubcategory = false; // Track if any visible dishes in this subcategory

            // Check if the subcategory name matches the search term
            const subcategoryName = subcategoryBlock.querySelector('h4').textContent.toLowerCase();
            if (subcategoryName.includes(searchTerm)) {
                // If subcategory matches, show all dishes in this subcategory
                dishes.forEach(dish => {
                    dish.style.display = ''; // Show all dishes
                    hasVisibleDishesInSubcategory = true; // Mark that there's a visible dish
                    anyVisibleDish = true; // Set flag to true
                });
            } else {
                // Iterate through each dish
                dishes.forEach(dish => {
                    const dishName = dish.querySelector('h5').textContent.toLowerCase(); // Get dish name
                    if (dishName.includes(searchTerm)) {
                        dish.style.display = ''; // Show item if it matches
                        hasVisibleDishesInSubcategory = true; // Mark that there's a visible dish
                        anyVisibleDish = true; // Set flag to true
                    } else {
                        dish.style.display = 'none'; // Hide item if it doesn't match
                    }
                });
            }

            // If any dishes are found in this subcategory, show the subcategory block
            if (hasVisibleDishesInSubcategory) {
                subcategoryBlock.style.display = ''; // Show subcategory if it has visible dishes
                hasVisibleDishesInCategory = true; // Mark that there's at least one visible dish in the category
            } else {
                subcategoryBlock.style.display = 'none'; // Hide subcategory if no dishes are visible
            }
        });

        // If no subcategories are visible, hide the category block
        if (hasVisibleDishesInCategory) {
            categoryBlock.style.display = ''; // Show category block if it has visible dishes
        } else {
            categoryBlock.style.display = 'none'; // Hide category block if no subcategories are visible
        }
    });

    // Show or hide no results image based on visibility of dishes
    if (anyVisibleDish) {
        noResultsDiv.style.display = 'none'; // Hide no results message
    } else {
        noResultsDiv.style.display = 'block'; // Show no results message
    }
});


function resetFilter() {
    const categoryBlocks = document.querySelectorAll('.category-block'); // Get all category blocks

    // Show all category blocks
    categoryBlocks.forEach(categoryBlock => {
        categoryBlock.style.display = ''; // Reset display to show all categories
        const subcategoryBlocks = categoryBlock.querySelectorAll('.subcategory-block');

        // Show all subcategory blocks and their dishes
        subcategoryBlocks.forEach(subcategoryBlock => {
            subcategoryBlock.style.display = ''; // Show all subcategories
            const dishes = subcategoryBlock.querySelectorAll('.menu-item');

            // Show all dishes
            dishes.forEach(dish => {
                dish.style.display = ''; // Show all dishes
            });
        });
    });
}

// Clear the search bar when the clear button is clicked
clearSearchButton.addEventListener('click', function() {
    searchBar.value = '';
    clearSearchButton.style.display = 'none';
    resetFilter();
    searchBar.focus();
});

//async function getPincodeUsingOSM(lat, lon) {
//    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
//    const response = await fetch(url);
//    const data = await response.json();
//    console.log("Pincode:", data.address.postcode);
//    alert("Your Pincode: "+data.address.postcode)
//}
//
//navigator.geolocation.getCurrentPosition((position) => {
//    getPincodeUsingOSM(position.coords.latitude, position.coords.longitude);
//});
