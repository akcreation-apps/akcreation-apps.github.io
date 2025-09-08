import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

let table_name = ''
let admin_id = ''

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
        admin_id = credentials.KEY
        return initializeApp(firebaseConfig);
    });
}

// Fetch order details from Firebase
async function fetchOrderDetails(orderId, allOrders) {
    const app = await initializeFirebase();
    const db = getFirestore(app);

    // Reference to the document using its ID
    const orderRef = doc(db, table_name, orderId); // `table_name` is your collection name

    // Get the document snapshot
    const docSnap = await getDoc(orderRef);
    let updatedOrders = allOrders.map(order =>
        order.order_id === orderId ? { ...order, api_call: order.api_call || "Initiated" } : order
    );
    
    if (docSnap.exists()) {
        const orderData = docSnap.data(); // Get the data from the snapshot

        // Check if the status is 'Approved'
        if (orderData.status === 'Approved') {
            updatedOrders = updatedOrders.map(order =>
                order.order_id === orderId ? { ...order, api_call: "Approved" } : order
            );
            localStorage.setItem("order_history", JSON.stringify(updatedOrders));
            return orderData; // Return the order data if status is approved
        } else if(orderData.status === 'Rejected'){
            updatedOrders = updatedOrders.map(order =>
                order.order_id === orderId ? { ...order, api_call: "Rejected" } : order
            );
            localStorage.setItem("order_history", JSON.stringify(updatedOrders));
            return null;
        }
        else {
            return null; // Or handle it as per your logic
        }
    } else {
        updatedOrders = updatedOrders.map(order =>
            order.order_id === orderId ? { ...order, api_call: "Deleted" } : order
        );
        localStorage.setItem("order_history", JSON.stringify(updatedOrders));
        return null; // Handle document not found
    }
}

// Function to fetch all orders based on IDs in localStorage
async function fetchOrders() {
    const orders = JSON.parse(localStorage.getItem('order_history')) || [];
    const orderList = document.getElementById('orderList');
    await initializeFirebase()
    showLoader(); // Show loader while fetching data
    if(orders && orders.length > 0){
        let data_available = false;
        for (const order of orders) {
            if(!order.api_call || order.api_call === "Initiated"){
                const allOrders = JSON.parse(localStorage.getItem('order_history')) || [];
                const orderData = await fetchOrderDetails(order.order_id, allOrders);
                if (orderData && order.admin_id === admin_id) {
                    const orderElement = createOrderElement(order, order.order_id);
                    orderList.appendChild(orderElement);
                    data_available = true
                }
            } else if (order.admin_id === admin_id && order.api_call === "Approved"){
                const orderElement = createOrderElement(order, order.order_id);
                    orderList.appendChild(orderElement);
                    data_available = true
            }
        }
        if(!data_available){
            document.getElementById('empty-invoice-banner').style.display = 'block';
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
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Create order element dynamically
function createOrderElement(order, order_id) {
    const orderElement = document.createElement('div');
    orderElement.classList.add('order-container');

    const orderDetails = order.order_details;
    const deliveryCharges = order.delivery_charges;
    const orderTime = formatDate(orderDetails.created_at.seconds);

    orderElement.innerHTML = `
        <div class="order-header">
            <h2>${orderDetails.table_no === 'COD' ? 'Payment Mode: COD' : `Table No: ${orderDetails.table_no}`}</h2>
            <p>${orderTime}</p>
        </div>
        <p class="order-total">Total: ₹${orderDetails.total_cart_value}</p>
        <div class="order-details">
            ${orderDetails.order_details.map(cat => `
                <h3>${cat.category.name}</h3>
                ${cat.category.dish_details.map(dish => `
                    <div class="dish-item">
                        <span class="dish-name">
                            ${dish.type === "NonVeg" ? dish.name + " (Non-Veg)" : dish.name}
                        </span>
                        <span>₹${dish.price} x ${dish.quantity}</span>
                    </div>
                `).join('')}
            `).join('')}
            ${orderDetails.delivery_charges
                ? `<div class="dish-item">
                       <span class="dish-name">Delivery Charges</span>
                       <span>₹${orderDetails.delivery_charges}</span>
                   </div>`
            : ''}
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
    const storedExpirationTime = localStorage.getItem('tcd_urlExpiration');
    if (storedExpirationTime) {
        const currentTime = Date.now();
        if (currentTime >= storedExpirationTime && localStorage.getItem('table')!=="COD") {
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

        }
    });
}

// Handle view functionality
function handleView(orderId) {
    // Redirect to another page with order ID as a query parameter
    window.location.href = `viewInvoice.html?order_id=${orderId}`;
}
