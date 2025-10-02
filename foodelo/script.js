const menuData = [
  {
    "category": "CHINESE ZONE",
    "items": [
      { "name": "Steam Rice", "price": "₹40" },
      { "name": "Veg Fried Rice", "price": "₹60" },
      { "name": "Egg Fried Rice", "price": "₹70" },
      { "name": "Egg Chicken Fried Rice", "price": "₹80" },
      { "name": "Veg Hakka Noodles", "price": "₹70" },
      { "name": "Egg Chicken Noodles", "price": "₹80" },
      { "name": "Veg (Chilli/Manchurian)", "price": "₹70" },
      { "name": "Egg (Chilli/Manchurian/65)", "price": "₹70" },
      { "name": "Paneer (Chilli/Manchurian/65)", "price": "₹90" },
      { "name": "Mushroom (Chilli/Manchurian/65)", "price": "₹90" },
      { "name": "Chicken (Chilli/Manchurian/65)", "price": "₹90" }
    ]
  },
  {
    "category": "QUICK BITES",
    "items": [
      { "name": "Egg Bread Omlet", "price": "₹60" },
      { "name": "American Corn", "price": "₹50" },
      { "name": "Veg Hot Dog", "price": "₹60" },
      { "name": "Paneer Hot Dog", "price": "₹70" },
      { "name": "Chicken Hot Dog", "price": "₹70" },
      { "name": "Paneer Roll", "price": "₹70" },
      { "name": "Mushroom Roll", "price": "₹70" },
      { "name": "Single Egg Chicken Roll", "price": "₹70" },
      { "name": "Double Egg Chicken Roll", "price": "₹80" }
    ]
  },
  {
    "category": "BEVERAGES",
    "items": [
      { "name": "Cold Coffee", "price": "₹40" },
      { "name": "Masala Colddrinks", "price": "₹40" },
      { "name": "Lime Soda", "price": "₹40" },
      { "name": "Blue Lagoon", "price": "₹60" },
      { "name": "Virgin Mojito", "price": "₹60" },
      { "name": "Red Cinderella", "price": "₹60" },
      { "name": "Litchy Sky", "price": "₹70" },
      { "name": "Vanila Milk Shake", "price": "₹70" },
      { "name": "Oreo Overload", "price": "₹70" },
    ]
  },
  {
    "category": "NORTH INDIAN TADKA",
    "items": [
      { "name": "Lachha Paratha", "price": "₹20" },
      { "name": "Egg Curry/Masala", "price": "₹70" },
      { "name": "Paneer Butter/Kadai/Masala", "price": "₹100" },
      { "name": "Mushroom Butter/Kadai/Masala", "price": "₹100" },
      { "name": "Chicken Butter/Kadai/Masala", "price": "₹100" },
      { "name": "Chicken Muglai", "price": "₹110" },
      { "name": "Paneer Biryani", "price": "₹120" },
      { "name": "Chicken Biryani", "price": "₹120" },
    ]
  },
  {
    "category": "REFRESHERS",
    "items": [
      { "name": "Adrak Tea", "price": "₹10" },
      { "name": "Coffee", "price": "₹20" },
      { "name": "Black Coffee", "price": "₹20" },
      { "name": "Cold Coffee", "price": "₹40" },
      { "name": "Veg Soup (Manchow/Hot N Sour)", "price": "₹40" },
      { "name": "Chicken Soup (Manchow/Hot N Sour)", "price": "₹50" },
    ]
  },
  {
    "category": "SANDWICH",
    "items": [
      { "name": "Veggies Mayo Sandwich", "price": "₹60" },
      { "name": "Corny Cheese Sandwich", "price": "₹60" },
      { "name": "Paneer Sandwich", "price": "₹70" },
      { "name": "Chicken Sandwich", "price": "₹70" },
      { "name": "Veggies Foodelo Club Sandwich", "price": "₹80" },
      { "name": "Chicken Foodelo Club Sandwich", "price": "₹90" }
    ]
  },
  {
    "category": "MAGGIE SWAGGY",
    "items": [
      { "name": "Classic Masala Maggie", "price": "₹50" },
      { "name": "Veggies Delight Maggie", "price": "₹60" },
      { "name": "Egg Bhurji Maggie", "price": "₹60" },
      { "name": "Paneer Maggie", "price": "₹70" },
      { "name": "Chicken Maggie", "price": "₹70" }
    ]
  },
  {
    "category": "BULKY BITES",
    "items": [
      { "name": "Veg Burger", "price": "₹50" },
      { "name": "Aloo Tikki Burger", "price": "₹60" },
      { "name": "Paneer Burger", "price": "₹70" },
      { "name": "Chicken Burger", "price": "₹70" },
      { "name": "Veg Classic Pasta", "price": "₹70" },
      { "name": "Chicken Classic Pasta", "price": "₹80" }

    ]
  },
  {
    "category": "PIZZA MANIA",
    "items": [
      { "name": "Margarita Pizza", "price": "₹70" },
      { "name": "Veg Maxican Pizza", "price": "₹80" },
      { "name": "Farmhouse Pizza", "price": "₹80" },
      { "name": "Chicken Pizza", "price": "₹100" }
    ]
  },
  {
    "category": "COMBOS",
    "items": [
      { "name": "Veg Burger + French Fries + Colddrinks", "price": "₹110" },
      { "name": "Chicken Burger + French Fries + Colddrinks", "price": "₹110" },
      { "name": "Veg Fried Rice + Paneer/Mushroom Chilly + Onion Salad", "price": "₹130" },
      { "name": "Egg Chicken Fried Rice + Chilly Chicken(3pc) + Onion Salad", "price": "₹130" }
    ]
  },
  {
    "category": "MOMO STATION",
    "items": [
      { "name": "Veg (6pc Steamed Momo)", "price": "₹50" },
      { "name": "Paneer (6PCS Steamed Momo)", "price": "₹60" },
      { "name": "Chicken (6PCS Steamed Momo)", "price": "₹60" },
    ]
  },
  {
    "category": "SALAD BAR",
    "items": [
      { "name": "Protein Salad", "price": "₹60" },
      { "name": "Chicken Loaded Salad", "price": "₹70" }
    ]
  },
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
