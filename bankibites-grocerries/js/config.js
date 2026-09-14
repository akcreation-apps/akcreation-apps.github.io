/**
 * BankiBites Grocerries — Central vendor config.
 * Change values here — every page reads from window.BB_CONFIG.
 * (Modeled after TCD's per-restaurant config pattern.)
 */
window.BB_CONFIG = {
  // Brand
  vendorName: 'BankiMart Grocerries',
  vendorShort: 'BankiMart',
  vendorAccent: '.',
  tagline: 'Fresh essentials, delivered.',

  // WhatsApp ordering (E.164 without + sign, per wa.me spec)
  whatsappNumber: '919114191989',

  // Delivery
  location: 'Banki 754008',
  city: 'Banki, Cuttack, Odisha',
  fullAddress: 'Banki, Cuttack, Odisha — 754008',
  // ------- Money / cart rules (all editable here) -------
  freeDeliveryThreshold: 499,   // subtotal at/above which delivery is FREE
  deliveryFee: 40,              // flat delivery charge when subtotal < threshold
  minOrder: 149,                // minimum cart subtotal to place an order
  deliveryTimeText: 'Next-day delivery',

  // Delivery ETA rule (local time, 24h).
  // Orders placed BEFORE `cutoffHour` → delivered on the following calendar day
  // between `windowStart` and `windowEnd`.  Orders at/after cutoff roll over
  // to the day after that.
  delivery: {
    cutoffHour: 22,   // 10 PM
    windowStart: 10,  // 10 AM
    windowEnd: 12,    // 12 PM (noon)
  },

  // Money
  currency: '₹',
  currencyCode: 'INR',

  // Storage keys
  // Bumping this version wipes stale local carts (used to invalidate carts
  // whose item image paths are broken after the .webp migration).
  cartStorageKey: 'bb_grocery_cart_v2',
  locationStorageKey: 'bb_grocery_place_v1',

  // Preset delivery places (grid style, matching TCD's place picker).
  // For anything outside this list, users pick "Other" and type the full address.
  deliveryPlaces: [
    'Banki',
    'Bankigada',
    'Bedapur',
    'Bheda',
    'Chakapada',
    'Charchika',
    'College Square',
    'Dangipita',
    'Gopalapur',
    'Harirajpur',
    'Karabara',
    'Khamaranga',
    'Patapur',
    'Ragadi',
    'Ranapur',
    'Sahadapada',
    'Similipur',
    'Sisua',
  ],

  // Support
  supportEmail: 'akcreation072k19@gmail.com',
  supportPhone: '+91 91141 91989',
  instagramUrl: 'https://www.instagram.com/bankibites/',

  // Legal / attribution
  // BankiMart is one storefront in the BankiBites family (kirana, grocery,
  // delivery, etc.). Surfaced in headers/footers/meta so shoppers know both
  // brands belong together.
  familyBrand: 'BankiBites',
  familyUrl: 'https://akcreation-apps.com/banki-bites/',
  parentBrand: 'AK Creation',
  parentUrl: 'https://akcreation-apps.com/services.html',

  // Copy blocks (edit here to update the whole site)
  // Hero section copy — edit here to change the landing page voice.
  hero: {
    eyebrow: 'Your local grocery mart · Online',
    eyebrowPrefix: 'Arriving',
    titleLine1: 'Need groceries?',
    titleLine2: 'Stay right there.',
    lede:
      'Your everyday kirana essentials, delivered to your door. No traffic. No queues. No carrying five bags while pretending everything is fine.',
  },

  // -----------------------------------------------------------------
  // SITE KILL SWITCH — flip `enabled: true` to take the entire website
  // offline and show the branded maintenance screen instead. All pages
  // (index, categories, search, ...) load this config first, so a single
  // toggle here disables the whole storefront.
  // -----------------------------------------------------------------
  maintenance: {
    enabled: false,
    title: 'Restocking the shelves',
    message:
      "BankiBites is polishing the counters and refilling the aisles. We'll be back shortly with fresher shelves and a smoother checkout.",
    eta: '', // e.g. 'in about 30 minutes' or 'Back tomorrow at 9 AM'
  },
};

// Maintenance renderer lives in js/maintenance.js — load that AFTER
// this file on any page that should honor the kill switch. Consumers
// that only need to read the flag (e.g. a parent hub) can include this
// file alone with no side effects.
