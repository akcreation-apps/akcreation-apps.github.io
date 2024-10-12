// Import the necessary Firebase services
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

// Initialize cart array to store selected items
let cart = JSON.parse(localStorage.getItem('cart')) || [];

const searchBar = document.getElementById('searchBar');
const clearSearchButton = document.getElementById('clearSearch');

// Function to check if an item is in the cart
const isItemInCart = (categoryName, dishName) => {
    if (cart && Array.isArray(cart)) {
            // Find the category in the cart
        const categoryInCart = cart.find(item => item.category.name === categoryName);

        // If the category exists, check for the dish in that category
        if (categoryInCart) {
            const dishInCart = categoryInCart.category.dish_details.find(dishItem => dishItem.name === dishName);
            return !!dishInCart; // Return true if dish is found, otherwise false
        }
    }

    return false; // Return false if category or dish is not found
};

// Update the cart count in the navbar to show the total number of unique dishes in the cart
const updateCartCount = () => {
    const cartCount = document.querySelector('.cart-count');
    
    // Ensure cart is not undefined or empty
    if (!cart || cart.length === 0) {
        cartCount.textContent = 0;
        return;
    }

    // Calculate the total number of unique dishes across categories in the cart
    const totalDishes = cart.reduce((sum, categoryItem) => {
        // Check if categoryItem and dish_details exist
        if (categoryItem.category && Array.isArray(categoryItem.category.dish_details)) {
            // Count the number of unique dishes within the category's dish_details array
            const uniqueDishesCount = categoryItem.category.dish_details.length; // Simply count the length of the dish_details array
            return sum + uniqueDishesCount; // Add the count of unique dishes
        }
        return sum;
    }, 0);

    // Update cart count with the total number of unique dishes
    cartCount.textContent = totalDishes;
};



// Add to Cart button functionality
const addToCart = (dishCategory, dishName, dishPrice, src, button) => {
    try {
        // Check if the category already exists in the cart
        let existingCategoryItem = cart.find(item => item.category.name === dishCategory);

        if (existingCategoryItem) {
            // Category exists, now check if the dish exists within that category
            let existingDish = existingCategoryItem.category.dish_details.find(dish => dish.name === dishName);
    
            if (existingDish) {
                // If the dish exists, increase the quantity
                existingDish.quantity += 1;
            } else {
                // If the dish doesn't exist, add the new dish to the category
                existingCategoryItem.category.dish_details.push({
                    name: dishName,
                    price: dishPrice,
                    quantity: 1,
                    image_src: src
                });
            }
        } else {
            // If the category doesn't exist, create a new category with the new dish
            cart.push({
                category: {
                    name: dishCategory,
                    dish_details: [
                        {
                            name: dishName,
                            price: dishPrice,
                            quantity: 1,
                            image_src: src
                        }
                    ]
                }
            });
        }
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartCount();
    } catch(e){
        localStorage.removeItem('cart');
    }

    // Change button text and style if item added for the first time
    button.textContent = 'Go to Cart';
    button.style.backgroundColor = 'green';

    // Add an event listener to navigate to the cart page on button click
    button.addEventListener('click', () => {
        window.location.href = 'cart.html';
    });
};

// Navigate to cart page on clicking the cart icon
const cartIcon = document.querySelector('.cart-icon');
cartIcon.addEventListener('click', () => {
    window.location.href = 'cart.html';
});

// Function to scroll to the category
const scrollToCategory = (categoryId) => {
    const categoryElement = document.getElementById(categoryId);
    if (categoryElement) {
        categoryElement.scrollIntoView({ behavior: 'smooth' });
    }
};

// Load menu data and create "Add to Cart" buttons
document.addEventListener('DOMContentLoaded', () => {
    store_data();
    fetch_data();

    // Set WhatsApp number if not already set in localStorage
    if (localStorage.getItem('whatsapp_no') === undefined) {
        localStorage.setItem('whatsapp_no', "+917749984274");
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

        showLoader(); // Show loader before starting the fetch request

        fetch('data.json')
            .then(response => response.json())
            .then(data => {
                // Reset shortcuts
                shortcutsContainer.innerHTML = '';

                // Create shortcut links based on categories
                data.menu.forEach(category => {
                    const shortcutCard = document.createElement('div');
                    shortcutCard.classList.add('shortcut-card');
                    const shortcutLink = document.createElement('a');
                    shortcutLink.href = `#${category.category}`; // Link to the category ID
                    shortcutLink.className = 'shortcut';
                    shortcutLink.textContent = category.category; // Set link text
                    shortcutCard.appendChild(shortcutLink);
                    shortcutsContainer.appendChild(shortcutCard); // Append to shortcuts container
                });

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
                            const url = get_dish_url(dish.name);
                            menuItem.innerHTML = `
                                <div class="menu-item-container" style="text-align: center;">
                                    <img src="${url}" alt="${dish.name}" style="width: 130px; height: 130px; object-fit: cover; border-radius: 8px; display: block; margin: 0 auto 10px auto;">
                                    <h5 style="margin-top: 10px;">${dish.name}</h5>
                                    <p class="price">₹${dish.price.toFixed(2)}/-</p>
                                    <button class="add-to-cart-btn" data-name="${dish.name}" data-price="${dish.price}">
                                        ${isItemInCart(subcategory.name, dish.name) ? 'Go to Cart' : 'Add to Cart'}
                                    </button>
                                </div>
                            `;

                            // Add event listener to "Add to Cart" button
                            const addToCartButton = menuItem.querySelector('.add-to-cart-btn');

                            if (isItemInCart(subcategory.name, dish.name)) {
                                addToCartButton.classList.add('added-to-cart'); // Add class if item is in cart
                            }

                            addToCartButton.addEventListener('click', () => {
                                const categoryInCart = cart.find(item => item.category.name === subcategory.name);

                                // Check if the category exists in the cart
                                if (categoryInCart) {
                                    // Check if the dish exists in that category
                                    const existingDish = categoryInCart.category.dish_details.find(dishItem => dishItem.name === dish.name);

                                    if (existingDish) {
                                        // If the dish is already in the cart, go to cart
                                        window.location.href = 'cart.html';
                                    } else {
                                        addToCart(subcategory.name, dish.name, dish.price, dish.image_url, addToCartButton);
                                    }
                                } else {
                                    // If the category doesn't exist, add a new category with the dish
                                    addToCart(subcategory.name, dish.name, dish.price, dish.image_url, addToCartButton);
                                }
                            });

                            dishGrid.appendChild(menuItem);
                            hasVisibleDishes = true; // Mark that there's at least one visible dish
                        });

                        if (dishGrid.children.length > 0) {
                            subcategoryBlock.appendChild(dishGrid);
                            categoryBlock.appendChild(subcategoryBlock);
                        }
                    });

                    if (hasVisibleDishes) {
                        menuContainer.appendChild(categoryBlock); // Only append if there are visible dishes
                    }
                });

                // Update cart count on page load
                updateCartCount();
            })
            .catch(error => {
                console.error('Error fetching menu data:', error);
                localStorage.removeItem('cart')
            })
            .finally(() => {
                hideLoader(); // Hide the loader once the data is fetched or on error
            });
    };

    renderMenu(); // Initial render of menu

    // Setup filter functionality
    const saveCheckboxState = () => {
        localStorage.setItem('onlyVeg', onlyVegCheckbox.checked);
        localStorage.setItem('onlyNonVeg', onlyNonVegCheckbox.checked);
        searchBar.value = ''; // Set the search bar value to empty
        renderMenu(); // Re-render menu when checkbox state changes
    };

    onlyVegCheckbox.addEventListener('change', saveCheckboxState);
    onlyNonVegCheckbox.addEventListener('change', saveCheckboxState);

    // Setup shortcut navigation
    const shortcuts = document.querySelectorAll('.shortcut');
    shortcuts.forEach(shortcut => {
        shortcut.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent default link behavior
            scrollToCategory(shortcut.textContent); // Scroll to the category
        });
    });
});

function decrypt_values(value, key){
    const decryptedBytes = CryptoJS.AES.decrypt(value, key);
    return decryptedBytes.toString(CryptoJS.enc.Utf8);
}

function fetch_data(){
    get_credentials().then(credentials => {
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
        // Step 4: Fetch data from Firestore
        getDocs(collection(db, decrypt_values(credentials.DB_NAME, credentials.KEY)))  // Replace 'users' with your collection name
            .then(querySnapshot => {
                querySnapshot.forEach(doc => {
                    if (doc.data().whatsapp_no !== undefined) {
                        localStorage.setItem('whatsapp_no', doc.data().whatsapp_no);
                    }
                    if (doc.data().disabled_items !== undefined) {
                        localStorage.setItem('disable_item_ids', doc.data().disabled_items);
                    }
                });
            })
            .catch(error => {
                console.error("Error fetching Firestore data:", error);
            });
    });
}

searchBar.addEventListener('input', function () {
    const searchBarRect = searchBar.getBoundingClientRect(); // Get the position of the search bar

    // Scroll to the top position of the search bar
    window.scrollTo({
        top: searchBarRect.top + window.scrollY-70, // Adjust for current scroll position
        behavior: 'smooth' // Smooth scroll
    });

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



// Add click event listener to the search icon
searchIcon.addEventListener('click', function () {
    // Get the search icon and search bar input
    const searchIcon = document.getElementById('searchIcon');
    const searchBar = document.getElementById('searchBar');
    searchBar.focus(); // Focus on the search bar when the icon is clicked
     // Scroll the search bar to the top of the viewport
     const searchBarRect = searchBar.getBoundingClientRect(); // Get the position of the search bar

     // Scroll to the top position of the search bar
     window.scrollTo({
         top: searchBarRect.top + window.scrollY-70, // Adjust for current scroll position
         behavior: 'smooth' // Smooth scroll
     });
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
    searchBar.value = ''; // Clear the search bar value
    clearSearchButton.style.display = 'none'; // Hide the clear button
    resetFilter(); // Reset the filter to show all items
});

// Optional: Focus on the search bar when the clear button is clicked
clearSearchButton.addEventListener('click', function() {
    searchBar.focus(); // Optionally, refocus on the search bar
});


//console.log("-----", get_Local_storage_data())
//console.log("---creds--", fetch_data())



// Example CRUD operations
// async function addFoodItem(item) {
//    try {
//        const docRef = await addDoc(collection(db, 'foodItems'), item);
//        console.log("Document written with ID: ", docRef.id);
//    } catch (e) {
//        console.error("Error adding document: ", e);
//    }
//}

//async function getFoodItems() {
//    const querySnapshot = await getDocs(collection(db, 'foodItems'));
//    querySnapshot.forEach((doc) => {
//        console.log(`${doc.id} => ${JSON.stringify(doc.data())}`);
//    });
//}

//async function updateFoodItem(id, updatedData) {
//    const foodItemRef = doc(db, 'foodItems', id);
//    await updateDoc(foodItemRef, updatedData);
//    console.log("Document updated with ID: ", id);
//}

//async function deleteFoodItem(id) {
//    await deleteDoc(doc(db, 'foodItems', id));
//    console.log("Document deleted with ID: ", id);
//}

// Example calls (uncomment to use)
//addFoodItem({ name: 'Pizza', price: 12.99 });
//getFoodItems();
