const RESTAURANT = {
    name:           "Unique Fast Food",
    prefix:         "unique",
    encKey:         ['Unique', 'Fast', 'Food'].join('-'),
    logo:           "unique-logo.png",
    mapsUrl:        "https://maps.app.goo.gl/6ReamGwRkHQQoaBy8",
    wpFallback:     "+917749984274",
    minOrder:       200,
    deliveryCharge: 50,
    etaMinutes:     45
};

function lsKey(key) { return RESTAURANT.prefix + '_' + key; }
