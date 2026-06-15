const RESTAURANT = {
    name:           "A1 Amul Fast Food",
    prefix:         "a1",
    encKey:         ['A1', 'AMUL', 'FAST', 'FOOD'].join('-'),
    logo:           "a1-logo.png",
    mapsUrl:        "https://maps.app.goo.gl/MRgifLEvf6UAxRp68",
    wpFallback:     "+917749984274",
    minOrder:       200,
    deliveryCharge: 50,
    etaMinutes:     30
};

function lsKey(key) { return RESTAURANT.prefix + '_' + key; }
