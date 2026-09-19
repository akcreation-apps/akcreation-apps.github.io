const RESTAURANT = {
    name:           "Hotel Aman & Sweets",
    prefix:         "hotel-aman-sweets",
    encKey:         ['HOTEL', 'AMAN', 'SWEETS'].join('-'),
    logo:           "hotel-aman-sweets-logo.png",
    mapsUrl:        "https://maps.app.goo.gl/4AQKDR75yxczvSDV6",
    wpFallback:     "7749984274",
    minOrder:       200,
    deliveryCharge: 50,
    etaMinutes:     45
};

function lsKey(key) { return RESTAURANT.prefix + '_' + key; }
