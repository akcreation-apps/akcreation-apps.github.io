const menuData = [
  {
    "category": "CHINESE ZONE",
    "items": [
      { "name": "Steam Rice", "price": "₹80" },
      { "name": "Veg Fried Rice", "price": "₹120" },
      { "name": "Egg Fried Rice", "price": "₹140" },
      { "name": "Egg Chicken Fried Rice", "price": "₹160" },
      { "name": "Veg Hakka Noodles", "price": "₹140" },
      { "name": "Egg Chicken Noodles", "price": "₹160" },
      { "name": "Veg (Chilli/Manchurian)", "price": "₹140" },
      { "name": "Egg (Chilli/Manchurian/65)", "price": "₹140" },
      { "name": "Paneer (Chilli/Manchurian/65)", "price": "₹180" },
      { "name": "Mushroom (Chilli/Manchurian/65)", "price": "₹180" },
      { "name": "Chicken (Chilli/Manchurian/65)", "price": "₹180" }
    ]
  },
  {
    "category": "QUICK BITES",
    "items": [
      { "name": "French Fries", "price": "₹80" },
      { "name": "Peri Peri French Fries", "price": "₹100" },
      { "name": "Egg Bread Omlet", "price": "₹120" },
      { "name": "American Corn", "price": "₹100" },
      { "name": "Veg Hot Dog", "price": "₹120" },
      { "name": "Paneer Hot Dog", "price": "₹140" },
      { "name": "Chicken Hot Dog", "price": "₹140" },
      { "name": "Paneer Roll", "price": "₹140" },
      { "name": "Mushroom Roll", "price": "₹140" },
      { "name": "Single Egg Chicken Roll", "price": "₹140" },
      { "name": "Double Egg Chicken Roll", "price": "₹160" }
    ]
  },
  {
    "category": "BEVERAGES",
    "items": [
      { "name": "Cold Coffee", "price": "₹80" },
      { "name": "Masala Colddrinks", "price": "₹80" },
      { "name": "Lime Soda", "price": "₹80" },
      { "name": "Blue Lagoon", "price": "₹120" },
      { "name": "Virgin Mojito", "price": "₹120" },
      { "name": "Red Cinderella", "price": "₹120" },
      { "name": "Litchy Sky", "price": "₹140" },
      { "name": "Vanila Milk Shake", "price": "₹140" },
      { "name": "Oreo Overload", "price": "₹140" }
    ]
  },
  {
    "category": "NORTH INDIAN TADKA",
    "items": [
      { "name": "Lachha Paratha", "price": "₹40" },
      { "name": "Egg Curry/Masala", "price": "₹140" },
      { "name": "Paneer Butter/Kadai/Masala", "price": "₹200" },
      { "name": "Mushroom Butter/Kadai/Masala", "price": "₹200" },
      { "name": "Chicken Butter/Kadai/Masala", "price": "₹200" },
      { "name": "Chicken Muglai", "price": "₹220" },
      { "name": "Paneer Biryani", "price": "₹240" },
      { "name": "Chicken Biryani", "price": "₹240" }
    ]
  },
  {
    "category": "REFRESHERS",
    "items": [
      { "name": "Adrak Tea", "price": "₹20" },
      { "name": "Coffee", "price": "₹40" },
      { "name": "Black Coffee", "price": "₹40" },
      { "name": "Cold Coffee", "price": "₹80" },
      { "name": "Veg Soup (Manchow/Hot N Sour)", "price": "₹80" },
      { "name": "Chicken Soup (Manchow/Hot N Sour)", "price": "₹100" }
    ]
  },
  {
    "category": "SANDWICH",
    "items": [
      { "name": "Veggies Mayo Sandwich", "price": "₹120" },
      { "name": "Corny Cheese Sandwich", "price": "₹120" },
      { "name": "Paneer Sandwich", "price": "₹140" },
      { "name": "Chicken Sandwich", "price": "₹140" },
      { "name": "Veggies Foodelo Club Sandwich", "price": "₹160" },
      { "name": "Chicken Foodelo Club Sandwich", "price": "₹180" }
    ]
  },
  {
    "category": "MAGGIE SWAGGY",
    "items": [
      { "name": "Classic Masala Maggie", "price": "₹100" },
      { "name": "Veggies Delight Maggie", "price": "₹120" },
      { "name": "Cheese Maggie", "price": "₹120" },
      { "name": "Egg Bhurji Maggie", "price": "₹120" },
      { "name": "Paneer Maggie", "price": "₹140" },
      { "name": "Chicken Maggie", "price": "₹140" }
    ]
  },
  {
    "category": "BULKY BITES",
    "items": [
      { "name": "Veg Burger", "price": "₹100" },
      { "name": "Aloo Tikki Burger", "price": "₹120" },
      { "name": "Paneer Burger", "price": "₹140" },
      { "name": "Chicken Burger", "price": "₹140" },
      { "name": "Veg Classic Pasta", "price": "₹140" },
      { "name": "Chicken Classic Pasta", "price": "₹160" }
    ]
  },
  {
    "category": "PIZZA MANIA",
    "items": [
      { "name": "Margarita Pizza", "price": "₹140" },
      { "name": "Veg Maxican Pizza", "price": "₹160" },
      { "name": "Farmhouse Pizza", "price": "₹160" },
      { "name": "Chicken Pizza", "price": "₹200" }
    ]
  },
  {
    "category": "COMBOS",
    "items": [
      { "name": "Lachha Paratha(2pc) + Veg Manchurian", "price": "₹180" },
      { "name": "Veg Burger + French Fries + Colddrinks", "price": "₹220" },
      { "name": "Chicken Burger + French Fries + Colddrinks", "price": "₹220" },
      { "name": "Veg Fried Rice + Paneer/Mushroom Chilly + Onion Salad", "price": "₹260" },
      { "name": "Egg Chicken Fried Rice + Chilly Chicken(3pc) + Onion Salad", "price": "₹260" }
    ]
  },
  {
    "category": "MOMO STATION",
    "items": [
      { "name": "Veg (6pc Steamed Momo)", "price": "₹100" },
      { "name": "Paneer (6PCS Steamed Momo)", "price": "₹120" },
      { "name": "Chicken (6PCS Steamed Momo)", "price": "₹120" }
    ]
  },
  {
    "category": "SALAD BAR",
    "items": [
      { "name": "Protein Salad", "price": "₹120" },
      { "name": "Chicken Loaded Salad", "price": "₹140" }
    ]
  }
];

function renderMenu(menuArray, containerId) {
    const container = document.getElementById(containerId);
    menuArray.forEach(cat => {
        const card = document.createElement("div");
        card.classList.add("menu-card");

        const title = document.createElement("div");
        title.classList.add("category-name");
        title.textContent = cat.category;

        const list = document.createElement("div");
        list.classList.add("menu-list");

        cat.items.forEach(item => {
            const row = document.createElement("div");
            row.classList.add("menu-item");

            // Veg / Non-Veg detection
            const lowerName = item.name.toLowerCase();
            let typeIcon = document.createElement("span");
            typeIcon.classList.add("food-type");

            if (/\b(egg|chicken)\b/i.test(item.name)) {
                typeIcon.classList.add("non-veg");
            } else {
                typeIcon.classList.add("veg");
            }


            const itemName = document.createElement("div");
            itemName.textContent = item.name;
            itemName.prepend(typeIcon);

            const price = document.createElement("div");
            price.classList.add("price-badge");
            price.textContent = item.price;

            row.appendChild(itemName);
            row.appendChild(price);
            list.appendChild(row);
        });

        card.appendChild(title);
        card.appendChild(list);
        container.appendChild(card);
    });
}

// Split into 2 pages: first 8, rest
renderMenu(menuData.slice(0, 8), "page1");
renderMenu(menuData.slice(8), "page2");
