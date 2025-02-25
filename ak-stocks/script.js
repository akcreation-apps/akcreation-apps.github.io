document.addEventListener("DOMContentLoaded", function () {
    fetch("stocks.json")
        .then(response => response.json())
        .then(data => displayStocks(data));
});

function toggleStockList() {
    const stockList = document.getElementById("stocks");
    stockList.classList.toggle("hidden");
}

function displayStocks(stocks) {
    const stockListDiv = document.getElementById("stocks");
    stockListDiv.innerHTML = "<h3>Tracked Stocks</h3>";

    const ul = document.createElement("ul");
    const stockUrls = new Set(); // To avoid duplicates

    stocks.forEach(stock => {
        if (!stockUrls.has(stock.Url)) {
            stockUrls.add(stock.Url);

            const li = document.createElement("li");
            li.textContent = `${stock.Name} - Rs. ${stock["Current Price"]}/-`;
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

