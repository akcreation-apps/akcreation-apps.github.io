const RESTAURANT = {
    name:           "Anvisha Kitchen",
    prefix:         "anvisha",
    encKey:         ['ANVISHA', 'KITCHEN'].join('-'),
    logo:           "anvisha-logo.png",
    mapsUrl:        "https://maps.app.goo.gl/Vj25rA6tu3dYSVFT8",
    wpFallback:     "7749984274",
    minOrder:       200,
    deliveryCharge: 50,
    etaMinutes:     60
};

function lsKey(key) { return RESTAURANT.prefix + '_' + key; }
