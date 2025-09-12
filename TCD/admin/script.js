// Import the necessary Firebase services
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, updateDoc, doc, Timestamp, orderBy, query, where } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';


window.doc_id = '';
window.doc_shop_status = '';
window.doc_opening_time = '';
window.doc_closing_time = '';
window.doc_whatsapp_no = '';
window.doc_disable_item_ids = '';
window.verify_number = verify_number;
window.save_changes = save_changes;
window.reset_changes = reset_changes;
window.toggleShopStatus = toggleShopStatus;

document.addEventListener('DOMContentLoaded', () => {
    const DAYS_RANGE = 150
    const passwordPopup = document.getElementById('passwordPopup');
    const submitPasswordButton = document.getElementById('submitPassword');
    const mainContent = document.getElementById('mainContent');
    const chartTab = document.getElementById('chartTab');
    const accessTab = document.getElementById('accessTab');
    const actionTab = document.getElementById('actionTab');
    const chartSection = document.getElementById('chartSection');
    const actionControlSection = document.getElementById('actionControlSection');
    const togglePassword = document.getElementById('togglePassword');
    const accessControlSection = document.getElementById('accessControlSection');
    const passwordError = document.getElementById('passwordError');
    const dishesListAccess = document.getElementById('dishesListAccess'); // Accessing the element here
    const searchBar = document.getElementById('searchBar');
    const clearSearchButton = document.getElementById('clearSearch');
    const noResultsContainer = document.getElementById('noResultsContainer');
    const noResultsImage = document.getElementById('noResultsImage');
    const passwordInput = document.getElementById('password');
    const numberInput = document.getElementById('inputNumber');
    const savedContainer = document.getElementById('saveContainer');
    const numberContainer = document.getElementById('numberContainer');
    const shopStatusContainer = document.getElementById('shopStatusContainer');
    const shopOpenToggle = document.getElementById('shopOpenToggle');
    const openHour = document.getElementById('openHour');
    const closeHour = document.getElementById('closeHour');
    const validateButton = document.getElementById('validateButton');

    let analyticsData = [];
    let sessionTime = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
    let password = ''
    get_credentials().then(credentials => {
        password = decrypt_values(credentials.PASS_KEY, credentials.KEY); // Example password
    });
    const sessionExpiration = localStorage.getItem('tcd_sessionExpiration');
    const currentTime = new Date().getTime();

    populateHours("openHour");
    populateHours("closeHour");

    togglePassword.addEventListener('change', function () {
        // Toggle the password visibility
        if (this.checked) {
            passwordInput.type = 'text'; // Show the password
        } else {
            passwordInput.type = 'password'; // Hide the password
        }
    });

    // Function to show the main content
    function showMainContent() {
        mainContent.style.display = 'block';
    }

    // Check if session has expired
    if (sessionExpiration && currentTime < sessionExpiration) {
        // Session is still valid; show the main content
        console.log("Session is valid. Showing main content.");
        showMainContent();
    } else {
        // Session expired or not set; show the password popup
        console.log("Session expired or not set. Showing password popup.");
        passwordPopup.style.display = 'flex';
    }

    // Handle password submission via button click
    submitPasswordButton.addEventListener('click', submitPassword);

    // Handle password submission via 'Enter' key press
    passwordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            submitPassword();
        }
    });

        // Set up session timeout handling
    let sessionExpired = false; // Flag to track if session has already expired

    setInterval(() => {
        const storedExpirationTime = localStorage.getItem('tcd_sessionExpiration');
        const currentTime = new Date().getTime(); // Get current time inside the interval

        // If the session has expired and hasn't been handled yet
        if (storedExpirationTime && currentTime > storedExpirationTime && !sessionExpired) {
            sessionExpired = true; // Set the flag to true to avoid repeated alerts
            Swal.fire({
                title: 'Session Timeout',
                text: 'Your session has expired. Please log in again.',
                icon: 'warning',
                confirmButtonText: 'OK'
            }).then((result) => {
                localStorage.removeItem('tcd_sessionExpiration'); // Clear session on timeout
                location.reload(); // Reload the page to prompt for the password again
            });
        }
    }, 1000);


    // Tab navigation
    chartTab.addEventListener('click', () => {
        chartTab.classList.add('active');
        actionTab.classList.remove('active');
        accessTab.classList.remove('active');
        chartSection.style.display = 'block';
        accessControlSection.style.display = 'none';
        actionControlSection.style.display = 'none';
        fetchJsonData(`tcd_order_data.json?v=${new Date().getTime()}`)
        .then(jsonData => {
            // Once the data is fetched, load the charts
            loadChartsFromJson(jsonData);
        });
    });

    accessTab.addEventListener('click', () => {
        accessTab.classList.add('active');
        actionTab.classList.remove('active');
        chartTab.classList.remove('active');
        chartSection.style.display = 'none';
        actionControlSection.style.display = 'none';
        accessControlSection.style.display = 'block';
        get_credentials().then(credentials => {  // Return the promise here
        try {
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
            getDocs(collection(db, decrypt_values(credentials.DB_NAME, credentials.KEY))) // Return this promise
                .then(querySnapshot => {
                    querySnapshot.forEach(doc => {
                    window.doc_id = doc.id;
                    if (doc.data().whatsapp_no !== undefined) {
                        window.doc_whatsapp_no = doc.data().whatsapp_no;
                        if(!localStorage.getItem('whatsapp_no')){
                            localStorage.setItem('whatsapp_no', window.doc_whatsapp_no);
                        } else{
                            if(localStorage.getItem('whatsapp_no') !== window.doc_whatsapp_no){
                                numberContainer.style.backgroundColor = 'antiquewhite';
                                validateButton.style.display = 'block';
                            }
                        }
                    }
                    if (doc.data().shop_status !== undefined) {
                        window.doc_shop_status = doc.data().shop_status;
                        if(!localStorage.getItem('shop_status')){
                            localStorage.setItem('shop_status', window.doc_shop_status);
                        } else{
                            if(localStorage.getItem('shop_status') !== window.doc_shop_status){
                                shopStatusContainer.style.backgroundColor = 'antiquewhite';
                            }
                        }
                    }
                    if (doc.data().opening_time !== undefined) {
                        window.doc_opening_time = doc.data().opening_time;
                        if(!localStorage.getItem('opening_time')){
                            localStorage.setItem('opening_time', window.doc_opening_time);
                        } else{
                            if(localStorage.getItem('opening_time') !== window.doc_opening_time){
                                shopStatusContainer.style.backgroundColor = 'antiquewhite';
                            }
                        }
                    }
                    if (doc.data().closing_time !== undefined) {
                        window.doc_closing_time = doc.data().closing_time;
                        if(!localStorage.getItem('closing_time')){
                            localStorage.setItem('closing_time', window.doc_closing_time);
                        } else{
                            if(localStorage.getItem('closing_time') !== window.doc_closing_time){
                                shopStatusContainer.style.backgroundColor = 'antiquewhite';
                            }
                        }
                    }
                    if (doc.data().disabled_items !== undefined) {
                        window.doc_disable_item_ids = JSON.parse(doc.data().disabled_items)
                        if(!localStorage.getItem('disable_item_ids')){
                            localStorage.setItem('disable_item_ids', doc.data().disabled_items);
                        } else{
                            update_save_container()
                        }
                    }
                    loadAccessControlData(); // Load data when Access Control tab is clicked
                });
            });
        } catch (e){
             Swal.fire({
                title: 'Connection Error',
                text: 'Please connect with developer.',
                icon: 'error',
                confirmButtonText: 'OK'
             }).then((result) => {
                location.reload(); // Reload the page to prompt for the password again
             });
        }
        });
    });

    // Load access control data from external JSON file
    function loadAccessControlData() {
        fetch(`../data.json?v=${new Date().getTime()}`) // Ensure the path to your JSON file is correct
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load data');
                }
                return response.json();
            })
            .then(data => {
                numberInput.value = localStorage.getItem('whatsapp_no').slice(3);
                openHour.value = localStorage.getItem('opening_time');
                closeHour.value = localStorage.getItem('closing_time');
                shopOpenToggle.checked = (localStorage.getItem('shop_status') === "open");
                const statusText = document.getElementById("shopStatusText");
                if (shopOpenToggle.checked) {
                    statusText.textContent = "Open";
                } else {
                    statusText.textContent = "Closed";
                }
                document.getElementById("timingsContainer").style.display = shopOpenToggle.checked ? "block" : "none";
                renderDishes(data); // Call the function to render dishes
            })
            .catch(error => {
                console.error('Error loading access control data:', error);
                Swal.fire('Error', 'Could not load access control data.', 'error');
            });
    }

    // Render dishes function
    function renderDishes(menuData) {
        dishesListAccess.innerHTML = ''; // Clear existing content

        // Retrieve disabled item IDs from localStorage
        let disable_items = JSON.parse(localStorage.getItem('disable_item_ids')) || [];

        menuData.menu.forEach(category => {
        category.subcategories.forEach(subcategory => {
            // Create subcategory title
            const subcategoryTitle = document.createElement('h4');

            if (subcategory.type !== undefined) {
                subcategoryTitle.textContent = `${subcategory.name} (${subcategory.type})`;
            } else {
                subcategoryTitle.textContent = `${subcategory.name}`;
            }

            dishesListAccess.appendChild(subcategoryTitle);

            subcategory.dishes.forEach(dish => {
                const dishElement = document.createElement('div');
                dishElement.classList.add('dish-item');

                // Check if dish is in disable_items and set the toggle accordingly
                const isDisabled = disable_items.includes(dish.id);
                let backgroundColor = 'azure'
                if(!window.doc_disable_item_ids.includes(dish.id)){
                    backgroundColor = 'antiquewhite'; // You can change this dynamically based on your logic
                }else if (!window.doc_disable_item_ids.includes(dish.id) && toggleButton.checked){
                    backgroundColor = 'azure'; // You can change this dynamically based on your logic
                }
                if(window.doc_disable_item_ids.includes(dish.id) && isDisabled){
                    backgroundColor = 'azure'; // You can change this dynamically based on your logic
                }else if (!window.doc_disable_item_ids.includes(dish.id) && !isDisabled){
                    backgroundColor = 'azure'; // You can change this dynamically based on your logic
                }else{
                    backgroundColor = 'antiquewhite'; // You can change this dynamically based on your logic
                }

                dishElement.style.backgroundColor = backgroundColor; // Dynamically setting background color

                dishElement.innerHTML = `
                    <span class="description">${dish.name} - ₹${dish.price}</span>
                    <label class="switch">
                        <input type="checkbox" id="toggle-${dish.id}" ${isDisabled ? '' : 'checked'}>
                        <span class="slider round"></span>
                    </label>
                `;

                // Add event listener to toggle button to update localStorage
                const toggleButton = dishElement.querySelector(`#toggle-${dish.id}`);
                toggleButton.addEventListener('change', function () {
                    if (toggleButton.checked) {
                        // Remove dish ID from disable_items if unchecked
                        disable_items = disable_items.filter(id => id !== dish.id);
                    } else {
                        // Add dish ID to disable_items if unchecked
                        if (!disable_items.includes(dish.id)) {
                            disable_items.push(dish.id);
                        }
                    }
                    if(window.doc_disable_item_ids.includes(dish.id) && !toggleButton.checked){
                        backgroundColor = 'azure'; // You can change this dynamically based on your logic
                    }else if (!window.doc_disable_item_ids.includes(dish.id) && toggleButton.checked){
                        backgroundColor = 'azure'; // You can change this dynamically based on your logic
                    }else{
                        backgroundColor = 'antiquewhite'; // You can change this dynamically based on your logic
                    }
                    dishElement.style.backgroundColor = backgroundColor;

                    // Update disable_item_ids in localStorage
                    localStorage.setItem('disable_item_ids', JSON.stringify(disable_items));

                    update_save_container()
                });
                dishesListAccess.appendChild(dishElement);
            });
        });
    });
}

    // Search functionality
    searchBar.addEventListener('input', function () {
        const searchTerm = searchBar.value.toLowerCase(); // Get the search term
        const dishItems = dishesListAccess.getElementsByClassName('dish-item'); // Get all dish items
        const subcategoryTitles = dishesListAccess.getElementsByTagName('h4'); // Get all subcategory titles

        let anyVisibleDish = false; // Flag to track if any dish is visible

        // Iterate through each subcategory title
        Array.from(subcategoryTitles).forEach(subcategoryTitle => {
            const subcategoryName = subcategoryTitle.textContent.toLowerCase(); // Get subcategory name

            // Get the related dish items by finding the next sibling elements until the next subcategory title
            let relatedDishItems = [];
            let nextSibling = subcategoryTitle.nextElementSibling;
            while (nextSibling && nextSibling.tagName !== 'H4') {
                if (nextSibling.classList.contains('dish-item')) {
                    relatedDishItems.push(nextSibling);
                }
                nextSibling = nextSibling.nextElementSibling;
            }

            let subcategoryMatch = false;

            // If the search term matches the subcategory name, show all related dishes
            if (subcategoryName.includes(searchTerm)) {
                subcategoryMatch = true;
                relatedDishItems.forEach(dishItem => {
                    dishItem.style.display = ''; // Show all dishes of the subcategory
                });
                anyVisibleDish = true; // Set flag to true since we matched a subcategory
                subcategoryTitle.style.display = ''; // Show subcategory title
            } else {
                // Initially hide the subcategory title until we check individual dishes
                subcategoryTitle.style.display = 'none';
            }

            // Iterate through each related dish item for individual dish name match
            relatedDishItems.forEach(dishItem => {
                const dishName = dishItem.querySelector('span').textContent.toLowerCase(); // Get dish name

                // If the search term matches the dish name, show the dish
                if (dishName.includes(searchTerm)) {
                    dishItem.style.display = ''; // Show item if name matches
                    subcategoryTitle.style.display = ''; // Ensure subcategory title is visible
                    anyVisibleDish = true; // Set flag to true since we matched a dish
                } else if (!subcategoryMatch) {
                    // Hide the dish if it doesn't match and no subcategory match
                    dishItem.style.display = 'none';
                }
            });

            // Show or hide the subcategory title based on whether it or any of its dishes are visible
            const hasVisibleDishes = relatedDishItems.some(item => item.style.display !== 'none');
            if (hasVisibleDishes) {
                subcategoryTitle.style.display = ''; // Show subcategory title if any dish is visible
            }
        });

        // Show or hide no results message based on whether any dish is visible
        if (anyVisibleDish) {
            noResultsContainer.style.display = 'none'; // Hide the no results image
        } else {
            noResultsContainer.style.display = 'block'; // Show the no results image
        }

        // Scroll to the top position of the search bar
        const searchBarRect = searchBar.getBoundingClientRect(); // Get the position of the search bar
        window.scrollTo({
            top: searchBarRect.top + window.scrollY - 10, // Adjust for current scroll position
            behavior: 'smooth' // Smooth scroll
        });

        // Show or hide clear button based on search input
        clearSearchButton.style.display = searchTerm ? 'block' : 'none'; // Show or hide the clear button based on the input
    });


    // Clear search functionality
    clearSearchButton.addEventListener('click', function () {
        searchBar.value = ''; // Clear the search bar value
        clearSearchButton.style.display = 'none'; // Hide clear button
        // Reset visibility of all dishes and subcategory titles
        Array.from(dishesListAccess.getElementsByClassName('dish-item')).forEach(dishItem => {
            dishItem.style.display = ''; // Show all items
        });
        // Show all subcategory titles
        Array.from(dishesListAccess.getElementsByTagName('h4')).forEach(subcategoryTitle => {
            subcategoryTitle.style.display = ''; // Show all subcategory titles
        });
    });

    function submitPassword() {
        const enteredPassword = passwordInput.value;
        if (enteredPassword === password) {
            // Set the session expiration time (30 minutes from now)
            const expirationTime = currentTime + sessionTime;
            localStorage.setItem('tcd_sessionExpiration', expirationTime);
            location.reload();
            passwordPopup.style.display = 'none';
        } else {
            passwordError.textContent = 'Incorrect password, please try again.';
        }
    }

    // Add an event listener for the 'input' event to capture each key press
    numberInput.addEventListener('input', function() {
        if(numberInput.value === window.doc_whatsapp_no.slice(3)){
            validateButton.style.display = 'none';
            numberContainer.style.backgroundColor = 'azure';
        }else{
            validateButton.style.display = 'block';
            numberContainer.style.backgroundColor = 'antiquewhite';
        }
        localStorage.setItem('whatsapp_no', "+91"+numberInput.value)
        update_save_container()
    });

    shopOpenToggle.addEventListener('change', function () {
        const newStatus = shopOpenToggle.checked ? "open" : "closed";
        localStorage.setItem('shop_status', newStatus);

        // Background color feedback
        if (newStatus === window.doc_shop_status) {
            shopStatusContainer.style.backgroundColor = 'azure';
        } else {
            shopStatusContainer.style.backgroundColor = 'antiquewhite';
        }

        update_save_container();
    });

    openHour.addEventListener('change', function () {
        localStorage.setItem('opening_time', openHour.value);
        if (openHour.value === window.doc_opening_time) {
            shopStatusContainer.style.backgroundColor = 'azure';
        } else {
            shopStatusContainer.style.backgroundColor = 'antiquewhite';
        }
        update_save_container();
    });

    closeHour.addEventListener('change', function () {
        localStorage.setItem('closing_time', closeHour.value);
        if (closeHour.value === window.doc_closing_time) {
            shopStatusContainer.style.backgroundColor = 'azure';
        } else {
            shopStatusContainer.style.backgroundColor = 'antiquewhite';
        }
        update_save_container();
    });

    function update_save_container() {
        const updated_disable_items = JSON.parse(localStorage.getItem('disable_item_ids')) || [];

        // Get local values
        const localWhatsapp = localStorage.getItem('whatsapp_no');
        const localShopStatus = localStorage.getItem('shop_status');
        const localOpenTime = localStorage.getItem('opening_time');
        const localCloseTime = localStorage.getItem('closing_time');

        // Get Firestore values
        const docWhatsapp = window.doc_whatsapp_no;
        const docShopStatus = window.doc_shop_status;
        const docOpenTime = window.doc_opening_time ? window.doc_opening_time : "00";
        const docCloseTime = window.doc_closing_time ? window.doc_closing_time : "00";

        // Compare disabled items
        const disableItemsEqual =
            updated_disable_items.every(element => window.doc_disable_item_ids.includes(element)) &&
            window.doc_disable_item_ids.every(element => updated_disable_items.includes(element));
        // Compare all values
        if (
            disableItemsEqual &&
            localWhatsapp === docWhatsapp &&
            localShopStatus === docShopStatus &&
            localOpenTime === docOpenTime &&
            localCloseTime === docCloseTime
        ) {
            savedContainer.style.display = 'none'; // No changes
        } else {
            savedContainer.style.display = 'block'; // Show Save Changes
        }
    }


    function logOrderId(action, orderId) {
        console.log(`Action: ${action}, Order ID: ${orderId}`);
        get_credentials().then(credentials => {
            try {
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
                let db_action = "Rejected"
                let alert_message = "Action can't be changed once you reject!"
                if(action == "correct"){
                    db_action = "Approved"
                    alert_message = "Action can't be changed once you approve!<br><br>Invoice will be access by customer."
                }

                const orderRef = doc(db, decrypt_values(credentials.ORDER_TABLE_NAME, credentials.KEY), orderId);
                Swal.fire({
                    title: 'Are you sure?',
                    html: alert_message,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'Proceed',
                    cancelButtonText: 'Cancel'
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        await updateDoc(orderRef, {
                            status: db_action
                        });
                        // Reload the page or remove the element dynamically
                        location.reload(); // or dynamically remove the deleted order from DOM
                    }
                });

            } catch (e) {
                Swal.fire({
                    title: 'Connection Error',
                    text: 'Please connect with the developer.',
                    icon: 'error',
                    confirmButtonText: 'OK'
                }).then((result) => {
                    location.reload(); // Reload the page to prompt for the password again
                });
            }
        })
    }

    function loadPreviousOrders() {
    const actionControlSection = document.getElementById('actionControlSection');
    let orders = []; // Initialize orders array

    // Start by getting credentials
    get_credentials().then(credentials => {
        try {
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

            // Create a query that filters by 'status' and orders by 'created_at' in descending order
            const ordersQuery = query(
                collection(db, decrypt_values(credentials.ORDER_TABLE_NAME, credentials.KEY)),
                where('status', '==', 'In Progress'), // Filter where 'status' is 'In Progress'
                orderBy('created_at', 'desc') // Order by 'created_at' field in descending order
            );

            // Get documents based on the query
            return getDocs(ordersQuery); // Return this promise
        } catch (e) {
            Swal.fire({
                title: 'Connection Error',
                text: 'Please connect with the developer.',
                icon: 'error',
                confirmButtonText: 'OK'
            }).then((result) => {
                location.reload(); // Reload the page to prompt for the password again
            });
        }
    }).then(querySnapshot => {
        if (!querySnapshot) return; // Handle case where query fails

        querySnapshot.forEach(doc => {
            orders.push({
                'order_id': doc.id,
                'order_details': doc.data(),
            });
        });

        // Check if orders are available
        if (orders.length === 0) {
            actionControlSection.innerHTML = '<p>No previous orders found.</p>';
            return;
        }

        let orderListHTML = '<h3>Pending Orders</h3><ul>';

        // Generate HTML for each order
        orders.forEach(order => {
            const orderDetails = order.order_details;
            const tableNo = orderDetails.table_no;
            const totalAmount = orderDetails.total_cart_value;
            const orderId = order.order_id; // Assuming order_id exists
            const date = new Date(orderDetails.created_at.seconds * 1000)
            const orderDate = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; // Assuming order_date is stored in a valid date format
            orderListHTML += `
                <li class="order-item">
                    <div class="order-header" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background-color: #fff; border-radius: 8px; box-shadow: 0px 1px 5px rgba(0, 0, 0, 0.1); margin-bottom: 10px; cursor: pointer;">
                        <div style="display: flex; flex-direction: column;">
                            <p style="margin: 0; font-size: 16px;">
                              <strong style="color: #007bff;">
                                ${tableNo === 'COD' ? 'Payment Mode: COD' : `Table No: ${tableNo}`}
                              </strong>
                            </p>
                            <p style="margin: 0; font-size: 14px; color: #28a745;"><strong>Total: ₹${totalAmount}</strong></p>
                        </div>
                        <p style="margin: 0; font-size: 14px; color: #6c757d;">${orderDate}</p>
                    </div>
                    <div class="order-details" style="display: none; margin-left: 20px; margin-top: 10px;">
                        <ul style="list-style-type: none; padding-left: 0;">
                            ${orderDetails.order_details.map(cat => `
                                <li><strong>${cat.category.name}</strong></li>
                                ${cat.category.dish_details.map(dish => `
                                    <li>${dish.quantity} x ${dish.name} - ₹${(dish.price * dish.quantity).toFixed(2)}</li>
                                `).join('')}
                            `).join('')}
                            ${orderDetails.delivery_charges && orderDetails.delivery_charges > 0
                            ? `<li style="color: red; font-weight: 600;">Delivery Charges - ₹${orderDetails.delivery_charges.toFixed(2)}</li>`
                            : ''}
                        </ul>
                        <div class="order-actions" style="display: flex; justify-content: space-between; margin-top: 10px;">
                            <button class="cross-icon" style="background: none; border: none; cursor: pointer;" data-order-id="${orderId}" data-action="cross">
                                <i class="fas fa-times" style="font-size: 20px; color: red;"></i>
                            </button>
                            <button class="correct-icon" style="background: none; border: none; cursor: pointer;" data-order-id="${orderId}" data-action="correct">
                                <i class="fas fa-check" style="font-size: 20px; color: green;"></i>
                            </button>
                        </div>
                    </div>
                </li>
            `;
        });

        orderListHTML += '</ul>';
        actionControlSection.innerHTML = orderListHTML;

        // Attach event listeners dynamically after rendering the list
        document.querySelectorAll('.order-header').forEach(orderHeader => {
            orderHeader.addEventListener('click', function () {
                const orderDetails = this.nextElementSibling;
                orderDetails.style.display = (orderDetails.style.display === 'none' || orderDetails.style.display === '') ? 'block' : 'none';
            });
        });

        // Add event listeners to the cross and correct icons
        document.querySelectorAll('.cross-icon, .correct-icon').forEach(icon => {
            icon.addEventListener('click', function () {
                const action = this.getAttribute('data-action');
                const orderId = this.getAttribute('data-order-id');
                logOrderId(action, orderId); // Call the logging function
            });
        });
    });
}



// Call loadPreviousOrders when the Action Control Section is opened
actionTab.addEventListener('click', function() {
    actionTab.classList.add('active');
    accessTab.classList.remove('active');
    chartTab.classList.remove('active');
    chartSection.style.display = 'none';
    accessControlSection.style.display = 'none';
    actionControlSection.style.display = 'block';
    loadPreviousOrders();
});

actionTab.click();

});

async function get_credentials() {
    try {
        // Fetch the JSON file
        const response = await fetch(`../credentials.json?v=${new Date().getTime()}`);

        // Check if the fetch was successful
        if (!response.ok) {
            throw new Error('Network response was not ok ' + response.statusText);
        }

        // Parse the JSON data
        const data = await response.json();

        return data; // Return the data
    } catch (error) {
        console.error('There was a problem with the fetch operation:', error);
        return null; // Return null or handle the error as needed
    }
}

function decrypt_values(value, key){
    const decryptedBytes = CryptoJS.AES.decrypt(value, key);
    return decryptedBytes.toString(CryptoJS.enc.Utf8);
}

// Function to send message via WhatsApp
function verify_number() {
    const message = "Your dining order will be delivered to this WhatsApp number.\nSave your modifications to begin receiving orders."
    const phoneNumber = localStorage.getItem('whatsapp_no')
    console.log(phoneNumber)
    const formattedMessage = message.replace(/\n/g, '%0A');  // Replace line breaks with %0A
    const url = `https://wa.me/${phoneNumber}?text=${formattedMessage}`;
    window.location.href = url; // Navigate to WhatsApp in the same tab
}

// Save changes in db
async function update_changes() {
    let success = false;

    try {
        // Await for the credentials to be fetched
        const credentials = await get_credentials();

        // Ensure credentials were fetched successfully
        if (!credentials) {
            console.log('Failed to get credentials.');
            return false; // Return false if credentials fetch failed
        }

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

        let updatedData = {
            'disabled_items': localStorage.getItem('disable_item_ids'),
            'whatsapp_no': localStorage.getItem('whatsapp_no'),
            'shop_status': localStorage.getItem('shop_status'),
            'opening_time': localStorage.getItem('opening_time'),
            'closing_time': localStorage.getItem('closing_time')
        };

        console.log(credentials);
        const foodItemRef = doc(db, decrypt_values(credentials.ADMIN_TABLE_NAME, credentials.KEY), window.doc_id);

        // Await for the updateDoc operation to complete
        await updateDoc(foodItemRef, updatedData);

        let data = {
            disabled_items_changes: {
                old_data: JSON.stringify(window.doc_disable_item_ids),
                new_data: localStorage.getItem('disable_item_ids')
            },
            whatsapp_no_changes: {
                old_data: window.doc_whatsapp_no,
                new_data: localStorage.getItem('whatsapp_no')
            },
            shop_status_changes: {
                old_data: window.doc_shop_status,
                new_data: localStorage.getItem('shop_status')
            },
            shop_opening_time_changes: {
                old_data: window.doc_opening_time,
                new_data: localStorage.getItem('opening_time')
            },
            shop_closing_time_changes: {
                old_data: window.doc_closing_time,
                new_data: localStorage.getItem('closing_time')
            },
            created_at: Timestamp.now()
        };

        await addDoc(collection(db, decrypt_values(credentials.ADMIN_HISTORY_TABLE_NAME, credentials.KEY)), data);

        return true; // Set success to true only after updateDoc completes successfully
    } catch (error) {
        console.error("Error updating document:", error);
        return false;
    }
}

async function save_changes() {
    const success = await update_changes();  // Wait for update_changes() to complete
    console.log(success)
    // Check the return value of update_changes
    if (success) {
        // Show SweetAlert message on success
        Swal.fire({
            title: 'Success',
            text: 'Changes saved successfully!',
            icon: 'success',
            confirmButtonText: 'OK'
        }).then((result) => {
            location.reload(); // Reload the page to prompt for the password again
        });
    } else {
        // Show error message if update_changes failed
        Swal.fire({
            title: 'Connection Error',
            text: 'Please connect with developer.',
            icon: 'error',
            confirmButtonText: 'OK'
         }).then((result) => {
            location.reload(); // Reload the page to prompt for the password again
         });
    }
}

async function reset_changes() {
    localStorage.removeItem('shop_status');
    localStorage.removeItem('opening_time');
    localStorage.removeItem('closing_time');
    localStorage.removeItem('disable_item_ids');
    localStorage.removeItem('whatsapp_no');
    Swal.fire({
        title: 'Success',
        text: 'Changes Reset Successfully!',
        icon: 'success',
        confirmButtonText: 'OK'
    }).then((result) => {
        location.reload(); // Reload the page to prompt for the password again
    });
}

// Function to create charts based on data with filters
function loadChartsFromJson(filteredData) {
    const chartsContainer = document.getElementById('chartSection');
    chartsContainer.innerHTML = ''; // Clear previous charts

    // Initialize data structures
    const totalCartValuesMap = {}; // Store sums by date
    const categoryValues = {};
    const tableOrders = {};
    const dishQuantity = {};
    const orderTimes = {}; // For peak order times
    const statusCounts = { 'In Progress': 0, 'Approved': 0, 'Rejected': 0 };
    const deliveryVsDineIn = { 'Delivery': 0, 'Dine-in': 0 };

    // Helper function to format date to '3rd Feb, 25'
    function formatDateCustom(date) {
        const day = date.getDate();
        const suffix = (day % 10 === 1 && day !== 11) ? 'st' :
                       (day % 10 === 2 && day !== 12) ? 'nd' :
                       (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
        const month = date.toLocaleString('default', { month: 'short' });
        const year = date.getFullYear().toString().slice(-2);
        return `${day}${suffix} ${month}, ${year}`;
    }

    // Process filtered data for analytics
    Object.values(filteredData).forEach(order => {
        const orderDate = new Date(order.created_at);
        const formattedDate = formatDateCustom(orderDate);

        // Track order status counts
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;

        if (order.status === "Approved") {
            totalCartValuesMap[formattedDate] = (totalCartValuesMap[formattedDate] || 0) + order.total_cart_value;

            // Track peak order times
            const orderTime = orderDate.getHours();
            orderTimes[orderTime] = (orderTimes[orderTime] || 0) + 1;

            // Process category-wise data
            order.order_details.forEach(detail => {
                const categoryName = detail.category.name;
                categoryValues[categoryName] = (categoryValues[categoryName] || 0) +
                    detail.category.dish_details.reduce((sum, dish) => {
                        dishQuantity[dish.name] = (dishQuantity[dish.name] || 0) + dish.quantity;
                        return sum + (dish.price * dish.quantity);
                    }, 0);
            });

            // Table-wise data & Delivery vs Dine-in
            if (order.table_no === 'COD') {
                deliveryVsDineIn['Delivery']++;
            } else {
                tableOrders[order.table_no] = (tableOrders[order.table_no] || 0) + 1;
                deliveryVsDineIn['Dine-in']++;
            }
        }
    });

    // Convert objects to arrays for charting
    const orderDatesArray = Object.keys(totalCartValuesMap);
    const totalCartValuesArray = Object.values(totalCartValuesMap);

    // Append a chart with a title
    function appendChart(title, chartElement) {
        const chartWrapper = document.createElement('div');
        chartWrapper.style.marginBottom = '30px';
        chartWrapper.style.textAlign = 'center';

        const header = document.createElement('h3');
        header.innerText = title;
        header.style.marginBottom = '10px';

        chartWrapper.append(header, chartElement);
        chartsContainer.appendChild(chartWrapper);
    }

    // Helper function to parse '3rd Feb, 25' to a Date object
    function parseCustomDate(dateStr) {
        const [dayWithSuffix, monthWithComma, year] = dateStr.split(' ');
        const day = parseInt(dayWithSuffix);
        const month = new Date(Date.parse(monthWithComma.replace(',', '') + " 1")).getMonth();
        const yearFull = 2000 + parseInt(year);
        return new Date(yearFull, month, day);
    }

    // Calculate last month and current month sales
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const lastMonth = (currentMonth === 0) ? 11 : currentMonth - 1;
    const currentYear = currentDate.getFullYear();
    const lastMonthYear = (currentMonth === 0) ? currentYear - 1 : currentYear;
    const formattedTableLabels = Object.keys(tableOrders).map(num => `Table ${num}`);

    let lastMonthSales = 0, currentMonthSales = 0;

    Object.entries(totalCartValuesMap).forEach(([dateStr, value]) => {
        const date = parseCustomDate(dateStr);
        const month = date.getMonth();
        const year = date.getFullYear();

        if (month === currentMonth && year === currentYear) {
            currentMonthSales += value;
        } else if (month === lastMonth && year === lastMonthYear) {
            lastMonthSales += value;
        }
    });

    // Append Charts
    appendChart("Monthly Sales Comparison", createChart('bar', ["Last Month", "Current Month"], [lastMonthSales, currentMonthSales], "Total Sales", true));
    appendChart("Total Sales Over Time", createChart('bar', orderDatesArray, totalCartValuesArray, 'Total Sales'));
    appendChart("Category-wise Sales", createChart('pie', Object.keys(categoryValues), Object.values(categoryValues), 'Total Amount'));
    appendChart("Orders Per Table", createChart('bar', formattedTableLabels, Object.values(tableOrders), 'Total Orders'));
    appendChart("Most Ordered Dishes", createChart('bar', Object.keys(dishQuantity), Object.values(dishQuantity), 'Total Ordered'));
    appendChart("Order Status Breakdown", createChart('doughnut', Object.keys(statusCounts), Object.values(statusCounts), 'Total'));
    appendChart("Delivery vs Dine-in", createChart('bar', Object.keys(deliveryVsDineIn), Object.values(deliveryVsDineIn), 'Total'));

    // Peak Order Times Chart
    const formattedHours = Object.keys(orderTimes)
        .map(hour => parseInt(hour))
        .sort((a, b) => a - b)
        .map(hour => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`);

    appendChart("Peak Order Times", createChart('bar', formattedHours, Object.values(orderTimes), 'Total Ordered'));

    enableInteractivity();
}

function createChart(type, labels, data, label, showPercentage = false) {
    const chartCanvas = document.createElement('canvas');
    const chartWrapper = document.createElement('div');
    chartWrapper.classList.add('chart');

    if (type === 'pie' || type === 'doughnut') {
        chartWrapper.classList.add('pie-chart'); // Add class for styling
    } else {
        chartCanvas.width = window.innerWidth * 0.9;
        chartCanvas.height = 400;
    }

    chartWrapper.appendChild(chartCanvas);

    // Function to shorten labels to a max length of 10 characters
    function shortenLabel(text, maxLength = 10) {
        return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    }

    // Apply label shortening for the x-axis labels (limit to 10 characters)
    const shortenedLabels = labels.map((innerLabel, index) => {
        return (index <= 2 && label === "Total Ordered") ? shortenLabel(innerLabel) : innerLabel;  // Shorten only the first label
    });

     // Calculate percentage change ONLY for "Monthly Sales Comparison"
     let percentText = "";
     let percentageChange = 0;
     if (showPercentage && data.length === 2 && data[0] !== 0) {
         percentageChange = ((data[1] - data[0]) / data[0]) * 100;
         percentText = percentageChange > 0 ? `📈 +${percentageChange.toFixed(2)}%` : `📉 ${percentageChange.toFixed(2)}%`;
     }

    new Chart(chartCanvas, {
        type: type,
        data: {
            labels: shortenedLabels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: generateRandomColors(data.length),
                borderColor: generateRandomColors(data.length),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                subtitle: {
                    display:label,
                    text: showPercentage ? `Sales Growth: ${percentText}` : "",
                    font: { size: 15, weight: 'bold' },
                    color: percentageChange > 0 ? 'green' : 'red'
                }
            }
        }
    });

    return chartWrapper;
}

// Helper function to generate random colors for charts
function generateRandomColors(count) {
    const predefinedColors = [
        'rgba(255, 140, 0, 0.7)',   // Dark Orange
        'rgba(0, 204, 102, 0.7)',   // Green
        'rgba(255, 69, 0, 0.7)',    // Red-Orange
        'rgba(106, 90, 205, 0.7)',  // Slate Blue
        'rgba(218, 165, 32, 0.7)',  // Goldenrod
        'rgba(255, 99, 132, 0.7)',  // Red
        'rgba(138, 43, 226, 0.7)',  // Blue Violet
        'rgba(64, 224, 208, 0.7)',  // Turquoise
        'rgba(255, 0, 127, 0.7)',   // Deep Pink
        'rgba(153, 102, 255, 0.7)', // Purple
        'rgba(0, 250, 154, 0.7)',   // Medium Spring Green
        'rgba(54, 162, 235, 0.7)',  // Blue
        'rgba(128, 0, 128, 0.7)',   // Dark Purple
        'rgba(255, 215, 0, 0.7)',   // Gold
        'rgba(75, 192, 192, 0.7)',  // Teal
        'rgba(32, 178, 170, 0.7)',  // Light Sea Green
        'rgba(255, 105, 180, 0.7)', // Hot Pink
        'rgba(46, 139, 87, 0.7)',   // Sea Green
        'rgba(255, 206, 86, 0.7)',  // Yellow
        'rgba(255, 159, 64, 0.7)',  // Orange
        'rgba(0, 102, 255, 0.7)',   // Deep Blue
        'rgba(204, 0, 204, 0.7)'    // Magenta
    ];
    
    
    return Array.from({ length: count }, (_, i) => predefinedColors[i % predefinedColors.length]);
}

function enableInteractivity() {
    const charts = document.querySelectorAll('canvas');

    charts.forEach(chart => {
        chart.addEventListener('mousemove', function (event) {
            const chartInstance = Chart.getChart(chart);
            if (!chartInstance) return;
            
            const points = chartInstance.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
            if (points.length) {
                chartInstance.tooltip.setActiveElements([{ datasetIndex: points[0].datasetIndex, index: points[0].index }], {
                    x: event.offsetX,
                    y: event.offsetY
                });
                chartInstance.update('none');
            }
        });

        chart.addEventListener('mouseleave', function () {
            const chartInstance = Chart.getChart(chart);
            if (chartInstance) {
                chartInstance.tooltip.setActiveElements([], {});
                chartInstance.update('none');
            }
        });
    });
}



// Function to fetch JSON data from a file
function fetchJsonData(url) {
    return fetch(url)
        .then(response => response.json())
        .catch(error => console.error('Error fetching JSON data:', error));
}

function populateHours(selectId) {
    let select = document.getElementById(selectId);
    for (let i = 0; i < 24; i++) {
        let option = document.createElement("option");
        option.value = i;
        option.text = i.toString().padStart(2, '0') + ":00";
        select.appendChild(option);
    }
}

function toggleShopStatus() {
    let isOpen = document.getElementById("shopOpenToggle").checked;
    document.getElementById("timingsContainer").style.display = isOpen ? "block" : "none";
    const statusText = document.getElementById("shopStatusText");

    if (isOpen) {
        statusText.textContent = "Open";
    } else {
        statusText.textContent = "Closed";
    }
}