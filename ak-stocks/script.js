document.addEventListener("DOMContentLoaded", function () {
    fetch("https://raw.githubusercontent.com/anil-kr-sahoo/stock_alert/main/stock_data.json")
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json(); // Return the parsed JSON
      })
      .then(data => {
        displayStocks(data); // Now `data` is available
        displayLastFetchedTime(data);
      })
      .catch(error => console.error("Error fetching JSON:", error));

    fetchOrders("https://raw.githubusercontent.com/anil-kr-sahoo/stock_alert/main/buy_stock_details.json", "buyOrders");
    fetchOrders("https://raw.githubusercontent.com/anil-kr-sahoo/stock_alert/main/sell_stock_details.json", "sellOrders");
});

function fetchOrders(url, tableId) {
    fetch(url)
        .then(response => response.json())
        .then(data => {
            displayOrders(data, tableId);
        })
        .catch(error => console.error(`Error fetching ${tableId} data:`, error));
}

function toggleStockList() {
    const stockList = document.getElementById("stocks");
    stockList.classList.toggle("hidden");
}

function displayStocks(stocks) {
    const stockListDiv = document.getElementById("stocks");
    stockListDiv.innerHTML = "<h3>Tracked Stocks</h3><p id='lastFetched'></p>";

    const ul = document.createElement("ul");
    const stockUrls = new Set(); // To avoid duplicates

    stocks.forEach(stock => {
        if (!stockUrls.has(stock.Url)) {
            stockUrls.add(stock.Url);

            const li = document.createElement("li");
            li.textContent = `${stock.Name} (Rs. ${stock["Current Price"]}/-)`;
            li.style.cursor = "pointer";
            li.onclick = () => window.open(stock.Url, "_blank");
            ul.appendChild(li);
        }
    });
    stockListDiv.appendChild(ul);
}

function sendMessage() {
    const phoneNumber = "+917749984274"; // Replace with the admin's WhatsApp number
    const messageInput = document.getElementById("chatMessage");
    const errorMessage = document.getElementById("error-message");

    const message = messageInput.value.trim();

    if (message === "") {
        errorMessage.style.display = "block"; // Show error message
    } else {
        errorMessage.style.display = "none"; // Hide error message if input is valid
        const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, "_blank");
        messageInput.value = ""; // Clear input after sending
    }
}

// Hide error message when typing
document.getElementById("chatMessage").addEventListener("input", function () {
    document.getElementById("error-message").style.display = "none";
});

// Function to display last fetched time
function displayLastFetchedTime(stocks) {
    if (stocks.length > 0 && stocks[0].hasOwnProperty("Time")) {
        const lastFetchedSpan = document.getElementById("lastFetched");
        const lastUpdated = new Date(stocks[0]["Time"]); // Convert to date

        const formattedTime = lastUpdated.toLocaleString(); // Format date to readable form
        lastFetchedSpan.textContent = `Last Fetched: ${formattedTime}`;
    }
}

function displayOrders(data, tableId) {
    const tableBody = document.getElementById(tableId);
    tableBody.innerHTML = "";

    // Get last 5 Orders
    const lastOrders = data.slice(-5).reverse();
    lastOrders.forEach(order => {
        const row = `<tr><td>${new Date(order.Time).toLocaleDateString()}</td><td>${order.Name}</td><td>Rs. ${order['Current Price']}/-</td></tr>`;
        tableBody.innerHTML += row;
    });
}