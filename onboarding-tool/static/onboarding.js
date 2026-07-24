(function () {
    const root = document.getElementById('menu-root');
    const statusEl = document.getElementById('status');
    const preload = Array.isArray(window.__PRELOAD__) ? window.__PRELOAD__ : [];

    function el(tag, attrs = {}, ...children) {
        const node = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === 'class') node.className = v;
            else if (k === 'checked' && v) node.checked = true;
            else if (k === 'value') node.value = v;
            else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
            else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
        }
        for (const c of children) {
            if (c == null) continue;
            node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        }
        return node;
    }

    function lastDishIdInCategory(catEl) {
        const rows = catEl.querySelectorAll('.dishes > .dish-row');
        for (let i = rows.length - 1; i >= 0; i--) {
            const v = rows[i].querySelector('input[data-field=id]').value.trim();
            if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
        }
        return null;
    }

    function makeDishRow(dish, catEl) {
        const row = el('div', { class: 'dish-row' });

        // Compute default id: previous+1 within the category, blank for the first dish in a new category.
        let idValue = '';
        if (dish && dish.id != null && dish.id !== '') {
            idValue = String(dish.id);
        } else if (catEl) {
            const last = lastDishIdInCategory(catEl);
            if (last != null) idValue = String(last + 1);
        }

        // Top line: id, name, price, remove
        const line1 = el('div', { class: 'dish-line' });
        line1.appendChild(el('input', { type: 'number', class: 'id-input', placeholder: 'ID', 'data-field': 'id', value: idValue, min: '1' }));
        line1.appendChild(el('input', { type: 'text', class: 'name-input', placeholder: 'Dish name *', 'data-field': 'name', value: (dish && dish.name) || '' }));
        line1.appendChild(el('input', { type: 'number', class: 'price-input', placeholder: 'Price *', min: '0', 'data-field': 'price', value: (dish && dish.price != null ? dish.price : '') }));
        line1.appendChild(el('button', {
            type: 'button', class: 'remove-btn', title: 'Remove dish',
            onclick: () => row.remove()
        }, '✕'));
        row.appendChild(line1);

        // Second line: optional fields
        const line2 = el('div', { class: 'dish-line optional' });
        const offerPriceInput = el('input', { type: 'number', placeholder: 'Offer price', min: '0', 'data-field': 'offer_price', value: (dish && dish.offer_price != null ? dish.offer_price : '') });
        line2.appendChild(offerPriceInput);
        const offerLabel = el('label', { class: 'inline' });
        const offerCb = el('input', { type: 'checkbox', 'data-field': 'is_offer', checked: !!(dish && dish.is_offer) });
        offerLabel.appendChild(offerCb);
        offerLabel.appendChild(document.createTextNode('is_offer'));
        line2.appendChild(offerLabel);

        const syncOfferWarning = () => {
            const hasOfferPrice = offerPriceInput.value.trim() !== '';
            row.classList.toggle('warn-offer', hasOfferPrice && !offerCb.checked);
        };
        offerPriceInput.addEventListener('input', syncOfferWarning);
        offerCb.addEventListener('change', syncOfferWarning);
        setTimeout(syncOfferWarning, 0);
        line2.appendChild(el('input', { type: 'number', placeholder: 'Available time', 'data-field': 'available_time', value: (dish && dish.available_time !== '' && dish.available_time != null ? dish.available_time : '') }));
        line2.appendChild(el('input', { type: 'number', placeholder: 'Not-available time', 'data-field': 'not_available_time', value: (dish && dish.not_available_time !== '' && dish.not_available_time != null ? dish.not_available_time : '') }));
        row.appendChild(line2);

        return row;
    }

    function addDish(dishesContainer, dish = {}) {
        const catEl = dishesContainer.closest('.category');
        dishesContainer.appendChild(makeDishRow(dish, catEl));
    }

    function addSubcategory(catBody, sub = {}) {
        const wrapper = el('div', { class: 'subcategory' });
        const head = el('div', { class: 'head-row' });
        head.appendChild(el('input', { type: 'text', placeholder: 'Subcategory name *', 'data-field': 'name', value: sub.name || '' }));

        const typeSel = el('select', { 'data-field': 'type' });
        for (const opt of [['', '— type (optional) —'], ['Veg', 'Veg'], ['NonVeg', 'NonVeg']]) {
            const o = el('option', { value: opt[0] }, opt[1]);
            if ((sub.type || '') === opt[0]) o.selected = true;
            typeSel.appendChild(o);
        }
        head.appendChild(typeSel);
        head.appendChild(el('button', {
            type: 'button', class: 'remove-btn', title: 'Remove subcategory',
            onclick: () => wrapper.remove()
        }, '✕'));
        wrapper.appendChild(head);

        const dishes = el('div', { class: 'dishes' });
        wrapper.appendChild(dishes);
        wrapper.appendChild(el('button', {
            type: 'button', class: 'mini secondary',
            onclick: () => addDish(dishes)
        }, '+ Add dish'));

        catBody.appendChild(wrapper);
        if (sub.dishes && sub.dishes.length) {
            sub.dishes.forEach(d => addDish(dishes, d));
        } else {
            addDish(dishes);
        }
    }

    function addCategory(cat = {}) {
        const wrapper = el('div', { class: 'category' });
        const head = el('div', { class: 'head-row' });
        head.appendChild(el('input', { type: 'text', placeholder: 'Category name *', 'data-field': 'name', value: cat.name || '' }));
        head.appendChild(el('button', {
            type: 'button', class: 'remove-btn', title: 'Remove category',
            onclick: () => wrapper.remove()
        }, '✕'));
        wrapper.appendChild(head);

        const body = el('div', { class: 'subcategories' });
        wrapper.appendChild(body);
        wrapper.appendChild(el('button', {
            type: 'button', class: 'mini secondary',
            onclick: () => addSubcategory(body)
        }, '+ Add subcategory'));

        root.appendChild(wrapper);
        if (cat.subcategories && cat.subcategories.length) {
            cat.subcategories.forEach(s => addSubcategory(body, s));
        } else {
            addSubcategory(body);
        }
    }

    function numOrEmpty(str) {
        const t = str.trim();
        if (t === '') return '';
        const n = Number(t);
        return Number.isNaN(n) ? '' : n;
    }

    function collect() {
        const categories = [];
        for (const cat of root.querySelectorAll(':scope > .category')) {
            const catName = cat.querySelector(':scope > .head-row > input[data-field=name]').value.trim();
            if (!catName) continue;
            const subs = [];
            for (const sub of cat.querySelectorAll(':scope > .subcategories > .subcategory')) {
                const name = sub.querySelector('input[data-field=name]').value.trim();
                const type = sub.querySelector('select[data-field=type]').value;
                if (!name) continue;
                const dishes = [];
                for (const row of sub.querySelectorAll('.dishes > .dish-row')) {
                    const dName = row.querySelector('input[data-field=name]').value.trim();
                    const priceStr = row.querySelector('input[data-field=price]').value.trim();
                    if (!dName || priceStr === '') continue;   // name + price are mandatory
                    const dish = { name: dName, price: Number(priceStr) };

                    const idVal = row.querySelector('input[data-field=id]').value.trim();
                    if (idVal !== '') dish.id = Number(idVal);

                    const op = row.querySelector('input[data-field=offer_price]').value.trim();
                    if (op !== '') dish.offer_price = Number(op);

                    if (row.querySelector('input[data-field=is_offer]').checked) dish.is_offer = true;

                    dish.available_time = numOrEmpty(row.querySelector('input[data-field=available_time]').value);
                    dish.not_available_time = numOrEmpty(row.querySelector('input[data-field=not_available_time]').value);

                    dishes.push(dish);
                }
                if (dishes.length) {
                    const subOut = { name, dishes };
                    if (type) subOut.type = type;   // only include type if user picked Veg / NonVeg
                    subs.push(subOut);
                }
            }
            if (subs.length) categories.push({ name: catName, subcategories: subs });
        }
        return categories;
    }

    const filterCb = document.getElementById('filter-offers');
    const filterCountEl = document.getElementById('filter-count');

    function isOfferDish(row) {
        const op = row.querySelector('input[data-field=offer_price]').value.trim();
        const io = row.querySelector('input[data-field=is_offer]').checked;
        return op !== '' || io;
    }

    function applyOfferFilter() {
        const on = filterCb.checked;
        let shown = 0;
        for (const cat of root.querySelectorAll(':scope > .category')) {
            let catShown = 0;
            for (const sub of cat.querySelectorAll(':scope > .subcategories > .subcategory')) {
                let subShown = 0;
                for (const row of sub.querySelectorAll('.dishes > .dish-row')) {
                    const match = !on || isOfferDish(row);
                    row.classList.toggle('filtered-out', !match);
                    if (match) subShown++;
                }
                sub.classList.toggle('filtered-out', on && subShown === 0);
                if (subShown > 0) catShown += subShown;
            }
            cat.classList.toggle('filtered-out', on && catShown === 0);
            shown += catShown;
        }
        filterCountEl.textContent = on ? `— showing ${shown} offer dish${shown === 1 ? '' : 'es'}` : '';
    }

    filterCb.addEventListener('change', applyOfferFilter);

    // Re-run whenever offer_price / is_offer changes anywhere in the tree.
    root.addEventListener('input', (e) => {
        if (!filterCb.checked) return;
        const t = e.target;
        if (t && (t.dataset.field === 'offer_price' || t.dataset.field === 'is_offer')) applyOfferFilter();
    });
    root.addEventListener('change', (e) => {
        if (!filterCb.checked) return;
        const t = e.target;
        if (t && t.dataset.field === 'is_offer') applyOfferFilter();
    });

    document.getElementById('add-category').addEventListener('click', () => { addCategory(); applyOfferFilter(); });

    document.getElementById('finish-btn').addEventListener('click', async () => {
        const categories = collect();
        if (!categories.length) {
            statusEl.textContent = 'Add at least one category with a dish (name + price required).';
            return;
        }
        statusEl.textContent = 'Saving…';
        try {
            const res = await fetch('/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categories })
            });
            const data = await res.json();
            if (!res.ok) {
                statusEl.textContent = 'Error: ' + (data.error || res.status);
                return;
            }
            window.location.href = data.redirect;
        } catch (e) {
            statusEl.textContent = 'Network error: ' + e.message;
        }
    });

    if (preload.length) {
        preload.forEach(c => addCategory(c));
    } else {
        addCategory();
    }
    applyOfferFilter();
})();
