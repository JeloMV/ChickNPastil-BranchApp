const db = require('../../lib/database');

function failure(res, error, label) {
    console.error(`${label}:`, error);
    res.status(500).json({ success: false, error: 'Unable to complete menu operation.' });
}

function list(req, res) {
    try {
        const includeArchived = req.query.includeArchived === 'true' && ['admin', 'manager'].includes((req.session?.user?.role || '').toLowerCase());
        const sections = db.prepare(`
            SELECT * FROM menu_section ${includeArchived ? '' : 'WHERE COALESCE(is_archived, 0) = 0'}
            ORDER BY section_id
        `).all();
        const products = db.prepare(`
            SELECT * FROM menu_products ${includeArchived ? '' : 'WHERE COALESCE(is_archived, 0) = 0'}
            ORDER BY product_id
        `).all();
        const addons = db.prepare('SELECT * FROM product_addons ORDER BY addon_id').all();

        res.json({
            success: true,
            sections: sections.map(section => ({
                ...section,
                is_available: Boolean(section.is_available),
                is_archived: Boolean(section.is_archived),
                products: products
                    .filter(product => product.section_id === section.section_id)
                    .map(product => ({
                        ...product,
                        price: Number(product.price),
                        is_available: Boolean(product.is_available),
                        allow_quantity: Boolean(product.allow_quantity),
                        is_archived: Boolean(product.is_archived),
                    })),
            })),
            addons: addons.map(addon => ({
                ...addon,
                addon_price: Number(addon.addon_price),
                is_available: Boolean(addon.is_available),
            })),
        });
    } catch (error) {
        failure(res, error, 'Menu fetch error');
    }
}

function listAddons(req, res) {
    try {
        const addons = db.prepare('SELECT * FROM product_addons ORDER BY addon_category, addon_id').all();
        res.json({ success: true, addons });
    } catch (error) {
        failure(res, error, 'Addon fetch error');
    }
}

function createSection(req, res) {
    const body = req.body || {};
    const name = typeof body.section_name === 'string' ? body.section_name.trim() : '';
    if (!name) return res.status(400).json({ success: false, error: 'Section name is required' });
    try {
        const result = db.prepare('INSERT INTO menu_section (section_name, is_available, is_archived) VALUES (?, 1, 0)').run(name);
        res.json({ success: true, section_id: Number(result.lastInsertRowid) });
    } catch (error) {
        failure(res, error, 'Section creation error');
    }
}

function updateSection(req, res) {
    const body = req.body || {};
    const name = typeof body.section_name === 'string' ? body.section_name.trim() : '';
    if (!name) return res.status(400).json({ success: false, error: 'Section name is required' });
    try {
        const result = db.prepare('UPDATE menu_section SET section_name = ? WHERE section_id = ?').run(name, req.params.id);
        if (!result.changes) return res.status(404).json({ success: false, error: 'Section not found' });
        res.json({ success: true, message: 'Section renamed successfully' });
    } catch (error) {
        failure(res, error, 'Section update error');
    }
}

function toggleArchive(table, idColumn, req, res) {
    try {
        const row = db.prepare(`SELECT is_archived FROM "${table}" WHERE "${idColumn}" = ?`).get(req.params.id);
        if (!row) return res.status(404).json({ success: false, error: 'Record not found' });
        const status = row.is_archived ? 0 : 1;
        db.prepare(`UPDATE "${table}" SET is_archived = ? WHERE "${idColumn}" = ?`).run(status, req.params.id);
        res.json({ success: true, is_archived: Boolean(status) });
    } catch (error) {
        failure(res, error, 'Archive update error');
    }
}

function toggleSectionArchive(req, res) {
    toggleArchive('menu_section', 'section_id', req, res);
}

function createProduct(req, res) {
    const { section_id, product_name, description, price, allow_quantity, image_url } = req.body || {};
    const name = typeof product_name === 'string' ? product_name.trim() : '';
    const sectionId = Number(section_id);
    const productPrice = Number(price);
    if (!Number.isInteger(sectionId) || !name || !Number.isFinite(productPrice) || productPrice < 0) {
        return res.status(400).json({ success: false, error: 'Section, product name, and a valid price are required' });
    }
    try {
        const section = db.prepare('SELECT section_id FROM menu_section WHERE section_id = ?').get(sectionId);
        if (!section) return res.status(400).json({ success: false, error: 'Section not found' });
        const result = db.prepare(`
            INSERT INTO menu_products
                (section_id, product_name, description, price, is_available, image_url, allow_quantity, is_archived)
            VALUES (?, ?, ?, ?, 1, ?, ?, 0)
        `).run(sectionId, name, description || '', productPrice, image_url || 'assets/logo.png', allow_quantity === false ? 0 : 1);
        res.json({ success: true, product_id: Number(result.lastInsertRowid) });
    } catch (error) {
        failure(res, error, 'Product creation error');
    }
}

function updateProduct(req, res) {
    const { product_name, description, price, allow_quantity, image_url, section_id } = req.body || {};
    const updates = [];
    const values = [];
    if (product_name !== undefined) {
        if (typeof product_name !== 'string' || !product_name.trim()) {
            return res.status(400).json({ success: false, error: 'Product name is required' });
        }
        updates.push('product_name = ?');
        values.push(product_name.trim());
    }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (price !== undefined) {
        const value = Number(price);
        if (!Number.isFinite(value) || value < 0) return res.status(400).json({ success: false, error: 'Invalid price' });
        updates.push('price = ?');
        values.push(value);
    }
    if (allow_quantity !== undefined) { updates.push('allow_quantity = ?'); values.push(allow_quantity ? 1 : 0); }
    if (image_url !== undefined) { updates.push('image_url = ?'); values.push(image_url); }
    if (section_id !== undefined) {
        const value = Number(section_id);
        if (!Number.isInteger(value) || !db.prepare('SELECT 1 FROM menu_section WHERE section_id = ?').get(value)) {
            return res.status(400).json({ success: false, error: 'Invalid section' });
        }
        updates.push('section_id = ?');
        values.push(value);
    }
    if (!updates.length) return res.status(400).json({ success: false, error: 'No fields to update' });

    try {
        values.push(req.params.id);
        const result = db.prepare(`UPDATE menu_products SET ${updates.join(', ')} WHERE product_id = ?`).run(...values);
        if (!result.changes) return res.status(404).json({ success: false, error: 'Product not found' });
        res.json({ success: true, message: 'Product updated successfully' });
    } catch (error) {
        failure(res, error, 'Product update error');
    }
}

function toggleAvailability(req, res) {
    try {
        const row = db.prepare('SELECT is_available FROM menu_products WHERE product_id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ success: false, error: 'Product not found' });
        const status = row.is_available ? 0 : 1;
        db.prepare('UPDATE menu_products SET is_available = ? WHERE product_id = ?').run(status, req.params.id);
        res.json({ success: true, is_available: Boolean(status) });
    } catch (error) {
        failure(res, error, 'Availability update error');
    }
}

function toggleProductArchive(req, res) {
    toggleArchive('menu_products', 'product_id', req, res);
}

module.exports = {
    list,
    listAddons,
    createSection,
    updateSection,
    toggleSectionArchive,
    createProduct,
    updateProduct,
    toggleProductAvailability: toggleAvailability,
    toggleProductArchive,
};
