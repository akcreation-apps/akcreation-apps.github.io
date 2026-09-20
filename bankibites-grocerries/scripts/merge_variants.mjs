#!/usr/bin/env node
/**
 * One-off migration: group same-name `dishes` inside each subcategory into a
 * single product with a `variants[]` array. Backs up products.json first.
 *
 * Run:  node bankibites-grocerries/scripts/merge_variants.mjs
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..', 'data', 'products.json');
const BAK = SRC + '.bak';

const normalise = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Parse a unit like "500G", "1KG", "1.8L", "750ML", "12.1G" → grams/ml for sort.
function unitWeight(unit) {
  const u = String(unit || '').trim().toUpperCase().replace(/\s+/g, '');
  const m = u.match(/^([\d.]+)(KG|G|L|ML)$/);
  if (!m) return Number.POSITIVE_INFINITY;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return Number.POSITIVE_INFINITY;
  switch (m[2]) {
    case 'KG': return n * 1000;
    case 'G':  return n;
    case 'L':  return n * 1000;
    case 'ML': return n;
    default:   return Number.POSITIVE_INFINITY;
  }
}

const src = JSON.parse(readFileSync(SRC, 'utf8'));

if (!existsSync(BAK)) copyFileSync(SRC, BAK);

const mergedGroups = [];
const nearDup = [];

for (const cat of src.categories) {
  for (const sub of cat.subcategories) {
    const groups = new Map();
    for (const d of sub.dishes) {
      const key = normalise(d.name);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }

    const newDishes = [];
    for (const [key, dishes] of groups) {
      // Sort variants by unit weight (small → large).
      dishes.sort((a, b) => unitWeight(a.unit) - unitWeight(b.unit));

      const variants = dishes.map((d) => ({
        id: d.id,
        unit: d.unit,
        price: Number(d.price),
        mrp: Number(d.mrp ?? d.price),
        image: d.image,
        inStock: d.inStock !== false,
      }));

      const first = dishes[0];
      const product = {
        id: first.id, // stable = smallest-variant id
        name: first.name.trim(),
        featured: dishes.some((d) => d.featured === true),
        deal: dishes.some((d) => d.deal === true),
        image: first.image,
        variants,
      };
      newDishes.push(product);

      if (variants.length > 1) {
        mergedGroups.push({
          cat: cat.id,
          name: product.name,
          sizes: variants.map((v) => v.unit).join(', '),
        });
      }
    }

    // Detect near-duplicates: names within the subcategory that differ only by
    // trailing punctuation/whitespace or a "Sauce"/"Pack" suffix.
    const names = newDishes.map((p) => p.name);
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const b = names[j].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (a === b) continue;
        // Flag if one is a prefix of the other (with ≥ 8 chars overlap).
        if (a.length >= 8 && (b.startsWith(a) || a.startsWith(b))) {
          nearDup.push({ cat: cat.id, a: names[i], b: names[j] });
        }
      }
    }

    sub.dishes = newDishes;
  }
}

writeFileSync(SRC, JSON.stringify(src, null, 2) + '\n', 'utf8');

console.log(`\n✓ Wrote ${SRC}`);
console.log(`✓ Backup at ${BAK}`);
console.log(`\nMerged ${mergedGroups.length} multi-variant groups:\n`);
for (const g of mergedGroups) {
  console.log(`  [${g.cat}] ${g.name}  →  ${g.sizes}`);
}
if (nearDup.length) {
  console.log(`\nNear-duplicate names (review manually — NOT merged):\n`);
  for (const d of nearDup) {
    console.log(`  [${d.cat}]  "${d.a}"   vs   "${d.b}"`);
  }
}
