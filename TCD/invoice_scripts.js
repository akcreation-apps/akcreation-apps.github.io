import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

let table_name = ''
// Initialize Firebase
function initializeFirebase() {
    return get_credentials().then(credentials => {
        const firebaseConfig = {
            apiKey: decrypt_values(credentials.API_KEY, credentials.KEY),
            authDomain: decrypt_values(credentials.AUTH_DOMAIN, credentials.KEY),
            projectId: decrypt_values(credentials.ID, credentials.KEY),
            storageBucket: decrypt_values(credentials.STORAGE_BUCKET, credentials.KEY),
            messagingSenderId: decrypt_values(credentials.MESSAGING_SENDER_ID, credentials.KEY),
            appId: decrypt_values(credentials.APP_ID, credentials.KEY),
            measurementId: decrypt_values(credentials.MEASUREMENT_ID, credentials.KEY)
        };
        table_name = decrypt_values(credentials.ORDER_TABLE_NAME, credentials.KEY)
        return initializeApp(firebaseConfig);
    });
}

// Fetch order details from Firebase
async function fetchOrderDetails(orderId) {
    const app = await initializeFirebase();
    const db = getFirestore(app);

    const docRef = doc(db, table_name, orderId); // Assuming collection name is 'orders'
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        return docSnap.data(); // Return order data
    } else {
        console.log('No such document!');
        return null;
    }
}

// Function to fetch all orders based on IDs in localStorage
async function fetchOrders() {
    const orders = JSON.parse(localStorage.getItem('order_history')) || [];
    const orderList = document.getElementById('orderList');

    showLoader(); // Show loader while fetching data
    if(orders && orders.length > 0){
        console.log(orders)
        for (const order of orders) {
            const orderData = await fetchOrderDetails(order.order_id);
            if (orderData) {
                const orderElement = createOrderElement(orderData, order.order_id);
                orderList.appendChild(orderElement);
            }
        }
    }
    else{
        document.getElementById('empty-invoice-banner').style.display = 'block';
    }

    hideLoader(); // Hide loader after data is fetched
}

// Format date utility function
function formatDate(seconds) {
    const date = new Date(seconds * 1000);
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Create order element dynamically
function createOrderElement(order, order_id) {
    const orderElement = document.createElement('div');
    orderElement.classList.add('order-container');

    const orderDetails = order.order_details;
    const orderTime = formatDate(order.created_at.seconds);

    orderElement.innerHTML = `
        <div class="order-header">
            <h2>Table No: ${order.table_no}</h2>
            <p>${orderTime}</p>
        </div>
        <p class="order-total">Total: ₹${order.total_cart_value}</p>
        <div class="order-details">
            ${order.order_details.map(cat => `
                <h3>${cat.category.name}</h3>
                ${cat.category.dish_details.map(dish => `
                    <div class="dish-item">
                        <span class="dish-name">${dish.name}</span>
                        <span>₹${dish.price} x ${dish.quantity}</span>
                    </div>
                `).join('')}
            `).join('')}
            <div class="icons">
                <i class="fas fa-trash delete-icon"></i>
                <i class="fas fa-eye preview-icon"></i>
            </div>
        </div>
    `;

    orderElement.addEventListener('click', () => {
        const details = orderElement.querySelector('.order-details');
        details.style.display = details.style.display === 'block' ? 'none' : 'block';
    });

    // Add event listeners for the delete and view icons
    orderElement.querySelector('.delete-icon').addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event from toggling the order details
        handleDelete(order_id); // Call the delete function
    });

    orderElement.querySelector('.preview-icon').addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event from toggling the order details
        handleView(order_id); // Call the view function
    });


    return orderElement;
}

// Call function on page load
document.addEventListener('DOMContentLoaded', () => {
    const storedExpirationTime = localStorage.getItem('urlExpiration');
    if (storedExpirationTime) {
        const currentTime = Date.now();
        console.log(currentTime)
        if (currentTime >= storedExpirationTime) {
            Swal.fire('Error', 'The URL is expired. Please rescan the QR.', 'error').then(() => {
                window.location.href = 'index.html'; // Replace 'index.html' with your home page URL
            });
            return;
        }
    } else if(!storedExpirationTime){
        Swal.fire('Error', 'The URL is expired. Please rescan the QR.', 'error').then(() => {
            window.location.href = 'index.html'; // Replace 'index.html' with your home page URL
        });
        return;
    }
    fetchOrders(); // Fetch orders on load
});

let cart = JSON.parse(localStorage.getItem('cart')) || [];
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
updateCartCount();

// Handle delete functionality
function handleDelete(orderId) {
    // Show SweetAlert confirmation
    Swal.fire({
        title: 'Are you sure?',
        text: "Do you want to delete this order?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, delete it!',
        cancelButtonText: 'Cancel'
    }).then((result) => {
        if (result.isConfirmed) {
            let orders = JSON.parse(localStorage.getItem('order_history')) || [];

            // Filter out the order with the specified orderId
            orders = orders.filter(order => order.order_id !== orderId);

            // Update localStorage with the remaining orders
            localStorage.setItem('order_history', JSON.stringify(orders));

            // Reload the page or remove the element dynamically
            location.reload(); // or dynamically remove the deleted order from DOM

            // Show success message after deletion
            Swal.fire(
                'Deleted!',
                'The order has been deleted.',
                'success'
            );
        }
    });
}

// Handle view functionality
function handleView(orderId) {
    // Redirect to another page with order ID as a query parameter
    window.location.href = `viewInvoice.html?order_id=${orderId}`;
}
