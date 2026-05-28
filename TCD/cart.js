import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore, collection, addDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
const BACKUP_WP_NO = RESTAURANT.wpFallback;
const MINIMUM_ORDER_PRICE = RESTAURANT.minOrder;
const DELIVERY_CHARGES = RESTAURANT.deliveryCharge;
// Retrieve the cart from localStorage
let cart = JSON.parse(localStorage.getItem(lsKey('cart'))) || [];

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
    const table = localStorage.getItem(lsKey('table'));

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
};


// Update session storage whenever cart changes
const updateCartStorage = () => {
    localStorage.setItem(lsKey('cart'), JSON.stringify(cart));
};

// Load the cart items when the cart page is opened
document.addEventListener('DOMContentLoaded', () => {
    showLoader();
    const storedExpirationTime = localStorage.getItem(lsKey('urlExpiration'));
    if (storedExpirationTime) {
        const currentTime = Date.now();
        if (currentTime < storedExpirationTime || localStorage.getItem(lsKey('table'))==="COD") {
            document.getElementById('invoiceIcon').style.display = 'flex';
        }
    }
    renderCartItems();
    updateDeliveryBadge();
    hideLoader();
});


// common.js

// Function to get cart items from local storage
function getCartItems() {
    const cart = JSON.parse(localStorage.getItem(lsKey('cart'))) || [];
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
    let message = `*${RESTAURANT.name}*\nHello, I would like to place an order for the following items:\n\n`;
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
    const table = localStorage.getItem(lsKey('table'));

    const place = localStorage.getItem(lsKey('place')) || '';
    if (table === 'COD') {
        // Apply delivery charge if below 200
        if (total > 0 && total < MINIMUM_ORDER_PRICE) {
            total += DELIVERY_CHARGES;
            deliveryNote = `\n(₹${DELIVERY_CHARGES} delivery charge applied for orders below ₹${MINIMUM_ORDER_PRICE})`;
        }
        const placeNote = place ? `\nDelivering at: ${place}` : '';
        message += `Total Price: ₹${total.toFixed(0)}/-\n${deliveryNote}${placeNote}\nPayment Mode: Cash On Delivery`;
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

// Event listener for the "Place Order" button
const placeOrderButton = document.getElementById('place-order-btn');

placeOrderButton.addEventListener('click', () => {
    showLoader();
    const cartItems = getCartItems(); // Get cart items
    const storedExpirationTime = localStorage.getItem(lsKey('urlExpiration'));
    const storedShopStatus = localStorage.getItem(lsKey('shop_status'));
    const storedOpeningTime = localStorage.getItem(lsKey('opening_time'));
    const storedClosingTime = localStorage.getItem(lsKey('closing_time'));
    const currentHour = new Date().getHours();
    if (storedExpirationTime && localStorage.getItem(lsKey('table'))!=="COD") {
        const currentTime = Date.now();
        if (currentTime >= storedExpirationTime) {
            Swal.fire('Error', 'The URL is expired. Please rescan the QR.', 'error');
            hideLoader();
            return;
        }
    } else if(!storedExpirationTime){
        Swal.fire('Access Required', 'Please use your ordering link to place an order.', 'info');
        hideLoader();
        return;
    }
    if (storedShopStatus ==="closed") {
        Swal.fire('We\'re currently closed 🛑','Our shop is taking a break right now. Please check back when we\'re open!', 'info');
        hideLoader();
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
        hideLoader();
        return;
    }
    if (cartItems.length === 0) {
        Swal.fire('Error', 'Your cart is empty.', 'error').then(() => {
            location.reload(); // Reload the page after clicking OK
        });
        hideLoader();
        return;
    }
    const today = new Date().toDateString();
    const lastOrderDate = localStorage.getItem(lsKey('order_date'));
    let ordersToday = parseInt(localStorage.getItem(lsKey('order_count')) || '0', 10);
    if (lastOrderDate && lastOrderDate !== today) {
        localStorage.removeItem(lsKey('order_date'));
        localStorage.removeItem(lsKey('order_count'));
        ordersToday = 0;
    }
    if (ordersToday >= 5) {
        Swal.fire('Daily Limit Reached', 'You have placed the maximum of 5 orders for today. Please try again tomorrow!', 'info');
        hideLoader();
        return;
    }
    const orderMessage = createOrderMessage(cartItems);
    let phoneNo = ''
    if (!localStorage.getItem(lsKey('whatsapp_no'))) {
        phoneNo = BACKUP_WP_NO;
    } else{
        phoneNo = localStorage.getItem(lsKey('whatsapp_no'));
    }
    collect_data()
    localStorage.setItem(lsKey('order_date'), today);
    localStorage.setItem(lsKey('order_count'), ordersToday + 1);
    sendWhatsAppMessage(orderMessage, phoneNo); // Send WhatsApp message
    hideLoader();
    Swal.fire('Success', 'Order Placed Successfully.', 'success').then(() => {
        location.reload(); // Reload the page after clicking OK
    });
});

function collect_data(){
    let order_history = JSON.parse(localStorage.getItem(lsKey('order_history'))) || [];
    get_credentials().then(credentials => {  // Return the promise here
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
        const cartTotalValue = document.getElementById('cart-total').textContent
        const deliveryNoteValue = document.getElementById('delivery-note').textContent
        const cartTotalNumber = parseFloat(cartTotalValue.replace(/[^0-9.-]+/g,"")); // Removes currency symbols, etc.
        let data = {
            'order_details':getCartItems(),
            'triggered_to':localStorage.getItem(lsKey('whatsapp_no')),
            'total_cart_value':cartTotalNumber,
            'table_no':localStorage.getItem(lsKey('table')),
            'tcd_place':localStorage.getItem(lsKey('place')) || '',
            'status':'In Progress',
            'created_at':Timestamp.now()}
        if (deliveryNoteValue.includes("delivery charge")) {
            data['delivery_charges'] = DELIVERY_CHARGES;
        }
        // Add the document to Firestore
        addDoc(collection(db, decrypt_values(credentials.ORDER_TABLE_NAME, _cfg)), data)
            .then(docRef => {
                // Add order details to localStorage
                order_history.push({
                    'order_id': docRef.id,
                    'admin_id': _cfg,
                    'api_call': 'Initiated',
                    'order_details': data // Instead of fetching it again, use the data you just sent
                });
                localStorage.setItem(lsKey('order_history'), JSON.stringify(order_history)); // Store as string
            })
            .catch(error => {
                console.error("Error adding document: ", error);
            });
        localStorage.removeItem(lsKey('cart'))

    });
}
