const RESTAURANT = {
    name:           "Hello Pizza",
    prefix:         "hello-pizza",
    encKey:         ['HELLO', 'PIZZA'].join('-'),
    logo:           "hello-pizza-logo.png",
    mapsUrl:        "https://maps.app.goo.gl/Td8SV7g2KkW22mKf8",
    wpFallback:     "+91 98616 91544",
    minOrder:       200,
    deliveryCharge: 50,
    etaMinutes:     75
};

function lsKey(key) { return RESTAURANT.prefix + '_' + key; }
