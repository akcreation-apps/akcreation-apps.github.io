const RESTAURANT = {
    name:           "Biswal Bakery",
    prefix:         "biswal-bakery",
    encKey:         ['BISWAL', 'BAKERY'].join('-'),
    logo:           "biswal-bakery-logo.png",
    mapsUrl:        "https://maps.app.goo.gl/2Ewkw9Fe19gFGps26",
    wpFallback:     "7787905900",
    minOrder:       250,
    deliveryCharge: 50,
    etaMinutes:     120
};

function lsKey(key) { return RESTAURANT.prefix + '_' + key; }
