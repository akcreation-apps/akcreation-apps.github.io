const RESTAURANT = {
    name:           "Biswal Bakery",
    prefix:         "biswal-bakery",
    encKey:         ['BISWAL', 'BAKERY'].join('-'),
    logo:           "biswal-bakery-logo.png",
    mapsUrl:        "https://maps.app.goo.gl/2Ewkw9Fe19gFGps26",
    wpFallback:     "7749984274",
    minOrder:       400,
    deliveryCharge: 50,
    etaMinutes:     120
};

function lsKey(key) { return RESTAURANT.prefix + '_' + key; }

const BAKERY_EVENTS = ['Anniversary', 'Baby Shower', 'Birthday', 'Marriage', 'Ring Ceremony'];
const BAKERY_FLAVOURS = ['BlueBerry', 'Butter Scotch', 'Chocolate', 'Pineapple', 'Strawberry'];
