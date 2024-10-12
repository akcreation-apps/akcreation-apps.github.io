// Retrieve the cart from localStorage
let cart = JSON.parse(localStorage.getItem('cart')) || [];

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
                        <h5>${dishItem.name} (${categoryItem.category.name})</h5>
                        <p class="cart-item-price">₹${dishItem.price.toFixed(2)}/-</p>
                    </div>
                    <div class="cart-item-quantity">
                        <button class="decrease-quantity" data-category-index="${categoryIndex}" data-dish-index="${dishIndex}">-</button>
                        <span class="quantity">${dishItem.quantity}</span>
                        <button class="increase-quantity" data-category-index="${categoryIndex}" data-dish-index="${dishIndex}">+</button>
                    </div>
                    <button class="delete-item" data-category-index="${categoryIndex}" data-dish-index="${dishIndex}">
                        <i class="fas fa-trash"></i>
                    </button>
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
    let total = 0;

    // Iterate through each category and dish to calculate the total price
    cart.forEach(categoryItem => {
        categoryItem.category.dish_details.forEach(dishItem => {
            total += dishItem.price * dishItem.quantity;
        });
    });

    // Update the displayed total price
    totalPriceElement.textContent = `₹${total.toFixed(2)}`;
};


// Update session storage whenever cart changes
const updateCartStorage = () => {
    localStorage.setItem('cart', JSON.stringify(cart));
};

// Load the cart items when the cart page is opened
document.addEventListener('DOMContentLoaded', () => {
    showLoader();
    renderCartItems();
    hideLoader();
});


// common.js

// Function to get cart items from local storage
function getCartItems() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    return cart;
}

// Function to create the order message string
function createOrderMessage(cartItems) {
    let message = "Hello, I would like to place an order for the following items:\n\n";
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
            const dishName = dish.name; // Get the dish name
            const quantity = dish.quantity; // Get the quantity

            // Find if the dish already exists in this category
            const existingDish = categoryMap[categoryName].find(d => d.name === dishName);
            
            if (existingDish) {
                // If it exists, update the quantity
                existingDish.quantity += quantity;
            } else {
                // If it doesn't exist, add it to the category
                categoryMap[categoryName].push({ name: dishName, quantity: quantity });
            }
        });
    });

    // Build the message with categories and their dishes
    for (const category in categoryMap) {
        message += `*${category}:*\n`; // Add category header

        categoryMap[category].forEach(dish => {
            message += `  - ${dish.name} (${dish.quantity}x)\n`; // List each dish under the category
        });

        message += '\n'; // Add a new line after each category
    }

    message += `Total Price: ₹${calculateTotal(cartItems).toFixed(2)}/-\n\nTable Number: ${localStorage.getItem('table')}`;
    return message; // Return the constructed message
}


// Function to calculate total amount
function calculateTotal(cartItems) {
    return cartItems.reduce((total, categoryItem) => {
        // Iterate through each dish detail in the category
        return total + categoryItem.category.dish_details.reduce((categoryTotal, dish) => {
            // Sum up the price of each dish multiplied by its quantity
            return categoryTotal + (dish.price * dish.quantity);
        }, 0);
    }, 0);
}

// Function to send message via WhatsApp
function sendWhatsAppMessage(message, phoneNumber) {
    const formattedMessage = message.replace(/\n/g, '%0A');  // Replace line breaks with %0A
    const url = `https://wa.me/${phoneNumber}?text=${formattedMessage}`;
    window.location.href = url; // Navigate to WhatsApp in the same tab
}

// Event listener for the "Place Order" button
const placeOrderButton = document.getElementById('place-order-btn');

placeOrderButton.addEventListener('click', () => {
    showLoader();
    const cartItems = getCartItems(); // Get cart items
    const storedExpirationTime = localStorage.getItem('urlExpiration');
    if (storedExpirationTime) {
        const currentTime = Date.now();
        console.log(storedExpirationTime, currentTime)
        if (currentTime >= storedExpirationTime) {
            Swal.fire('Error', 'The URL is expired. Please rescan the QR.', 'error');
            hideLoader();
            return;
        }
    } 
    if (cartItems.length === 0) {
        Swal.fire('Error', 'Your cart is empty.', 'error');
        hideLoader();
        return;
    }
    const orderMessage = createOrderMessage(cartItems); 
    let phoneNo = ''
    if (localStorage.getItem('whatsapp_no') === undefined) {
        phoneNo = "+917749984274";
    } else{
        phoneNo = localStorage.getItem('whatsapp_no');
    }
    // Create order message
    // localStorage.setItem('cart', JSON.stringify(cartItems)); // Store cart in local storage
    sendWhatsAppMessage(orderMessage, phoneNo); // Send WhatsApp message
    hideLoader();
});
