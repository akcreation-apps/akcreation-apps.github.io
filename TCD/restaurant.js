const RESTAURANT = {
    name:           "The Cafe Darbar",
    prefix:         "tcd",
    encKey:         ['TCD', 'FOOD', 'CAFE'].join('-'),
    logo:           "tcd-logo.png",
    mapsUrl:        "https://maps.app.goo.gl/JSGtbqW55FQkPeBK6",
    wpFallback:     "+917749984274",
    minOrder:       200,
    deliveryCharge: 50
};

function lsKey(key) { return RESTAURANT.prefix + '_' + key; }
