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
        cart.forEach((item, index) => {
        const cartItem = document.createElement('div');
        cartItem.classList.add('cart-item');
        const url = get_dish_url(item.name)
        cartItem.innerHTML = `
            <img src="${url}" alt="${item.name}">
            <div class="cart-item-info">
                <h5>${item.name}</h5>
                <p class="cart-item-price">₹${item.price.toFixed(2)}/-</p>
            </div>
            <div class="cart-item-quantity">
                <button class="decrease-quantity" data-index="${index}">-</button>
                <span class="quantity">${item.quantity}</span>
                <button class="increase-quantity" data-index="${index}">+</button>
            </div>
            <button class="delete-item" data-index="${index}">
                <i class="fas fa-trash"></i>
            </button>        `;

        // Append event listeners for increase, decrease, and delete buttons
        cartItem.querySelector('.increase-quantity').addEventListener('click', () => {
            item.quantity += 1;
            updateCartStorage();
            renderCartItems(); // Re-render cart items to reflect changes
        });

        cartItem.querySelector('.decrease-quantity').addEventListener('click', () => {
            if (item.quantity > 1) {
                item.quantity -= 1;
                updateCartStorage();
                renderCartItems(); // Re-render cart items to reflect changes
            }
        });

        cartItem.querySelector('.delete-item').addEventListener('click', () => {

            Swal.fire({
                title: 'Confirm Delete!',
                html: 'Want to remove from your cart ?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Yes',
                cancelButtonText: 'No',
            }).then((result) => {
                if (result.isConfirmed) {
                    cart.splice(index, 1); // Remove item from cart
                    updateCartStorage();
                    renderCartItems(); // Re-render cart items to reflect changes
                }
            });

        });

        cartItemsContainer.appendChild(cartItem);
    });
    }
    updateTotalPrice();
};

// Update the total price dynamically
const updateTotalPrice = () => {
    let totalPrice = 0;

    cart.forEach(item => {
        totalPrice += item.price * item.quantity;
    });

    document.getElementById('cart-total').textContent = totalPrice.toFixed(2)+'/-';
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

    cartItems.forEach(item => {
        message += `${item.name} (${item.quantity}x)\n`; // Update the message format
    });

    message += `\nTotal Price: ₹${calculateTotal(cartItems).toFixed(2)}/-\n\nTable Number: ${localStorage.getItem('table')}`; // Update total price format
    return message; // Encode message for URL
}

// Function to calculate total amount
function calculateTotal(cartItems) {
    return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
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
