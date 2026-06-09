const RESTAURANT = {
    name:           "Maa Charchika Hotel N Restaurant",
    prefix:         "mch",
    encKey:         ['MAA', 'CHARCHIKA', 'HOTEL'].join('-'),
    logo:           "mch-logo.png",
    mapsUrl:        "https://maps.app.goo.gl/91yZ8VNZGZgkwAEs6",
    wpFallback:     "+917749984274",
    minOrder:       200,
    deliveryCharge: 50
};

function lsKey(key) { return RESTAURANT.prefix + '_' + key; }
