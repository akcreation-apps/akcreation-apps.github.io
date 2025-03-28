document.addEventListener("DOMContentLoaded", function () {
    fetch("https://raw.githubusercontent.com/anil-kr-sahoo/stock_alert/main/stock_data.json")
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json(); // Return the parsed JSON
      })
      .then(data => {
        const uniqueStocks = Array.from(new Map(data.map(stock => [stock.Name, stock])).values());
        renderCharts(uniqueStocks);
        const tableBody = document.getElementById("upcomingDividends");
      })
      .catch(error => console.error("Error fetching JSON:", error));

    fetchOrders("https://raw.githubusercontent.com/anil-kr-sahoo/stock_alert/main/buy_stock_details.json", "buyOrders");
    fetchOrders("https://raw.githubusercontent.com/anil-kr-sahoo/stock_alert/main/sell_stock_details.json", "sellOrders");
    const whatsappBtn = document.getElementById("whatsappBtn");
    if (whatsappBtn) {
        whatsappBtn.addEventListener("click", function () {
            const phoneNumber = "+917749984274";
            const message = "Hi! Am interested in joining Ak Stocks.";
            location.href = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
        });
    }
});

function fetchOrders(url, tableId) {
    fetch(url)
        .then(response => response.json())
        .then(data => {
            displayOrders(data, tableId);
        })
        .catch(error => console.error(`Error fetching ${tableId} data:`, error));
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
function truncateLabel(label, maxLength = 20) {
    return label.length > maxLength ? label.substring(0, maxLength) + "…" : label;
}
function renderCharts(stocks) {
    document.querySelectorAll('.loading').forEach(el => el.style.display = 'none');
    const ctx2 = document.getElementById("dividendROEChart").getContext("2d");
    const ctx5 = document.getElementById("debtEquityChart").getContext("2d");

    const labels = stocks.map(stock => truncateLabel(stock.Name));
    const dividends = stocks.map(stock => stock["Dividend Yield"]);
    const roe = stocks.map(stock => stock["ROE"]);
    const debtEquity = stocks.map(stock => stock["Debt to Equity"]);

    new Chart(ctx2, {
        type: "scatter",
        data: {
            datasets: [{
                label: "Dividend Yield vs ROE",
                data: dividends.map((y, i) => ({ x: roe[i], y, label: labels[i] })),
                backgroundColor: "lime"
            }]
        },
        options: { responsive: true, maintainAspectRatio: false,  plugins: { tooltip: { callbacks: { label: function(tooltipItem) { return labels[tooltipItem.dataIndex] + ': ROE ' + tooltipItem.raw.x + ', Yield ' + tooltipItem.raw.y; } } } } }
    });

    new Chart(ctx5, {
        type: "bar",
        data: { labels, datasets: [{ label: "Debt to Equity Ratio", data: debtEquity, backgroundColor: "pink" }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { ticks: { callback: (value) => truncateLabel(value) } } }
        }
    });
}