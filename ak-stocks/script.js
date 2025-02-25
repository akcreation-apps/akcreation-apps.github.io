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
    const addedUrls = new Set(); // Track added URLs to prevent duplicates

    stocks.forEach(stock => {
        if (!addedUrls.has(stock.Url)) { // Check if URL is already added
            const li = document.createElement("li");
            li.textContent = `${stock.Name} - Rs. ${stock["Current Price"]}/-`;
            li.style.cursor = "pointer";
            li.onclick = () => window.open(stock.Url, "_blank");

            ul.appendChild(li);
            addedUrls.add(stock.Url); // Add URL to the set
        }
    });

    stockListDiv.appendChild(ul);
}
