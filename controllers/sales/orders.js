const { randomInt } = require('crypto');
const db = require('../../lib/database');
const paymongo = require('./paymongo');

const orderStatuses = ['Pending', 'Preparing', 'Completed', 'Cancelled'];
const paymentStatuses = ['Pending', 'Verified', 'Failed', 'Refunded'];
const isManager = req => ['admin', 'manager'].includes((req.session?.user?.role || '').toLowerCase());
const branchFor = req => req.session.user.branchLocationName;

function canAccessOrder(req, res, orderId) {
    const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
    if (!order) {
        res.status(404).json({ success: false, error: 'Order not found' });
        return null;
    }
    if (!isManager(req) && order.branch_name !== branchFor(req)) {
        res.sendStatus(403);
        return null;
    }
    return order;
}

function getOrderDetails(order) {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.order_id);
    const addons = db.prepare(`
        SELECT * FROM order_item_addons
        WHERE order_item_id IN (${items.length ? items.map(() => '?').join(',') : 'NULL'})
    `).all(...items.map(item => item.order_item_id));
    const addonsByItem = new Map();
    for (const addon of addons) {
        const group = addonsByItem.get(addon.order_item_id) || [];
        group.push(addon);
        addonsByItem.set(addon.order_item_id, group);
    }
    return { ...order, items: items.map(item => ({ ...item, addons: addonsByItem.get(item.order_item_id) || [] })) };
}

function failure(res, error, label) {
    console.error(`${label}:`, error);
    res.status(500).json({ success: false, error: 'Unable to complete order operation.' });
}

function create(req, res) {
    const body = req.body || {};
    const { items } = body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Order must contain at least one item' });
    }

    const insertOrder = db.prepare(`
        INSERT INTO orders
            (cust_name, contact_number, other_contact, order_status, order_total, notes, branch_name, order_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, item_name, unit_price, quantity, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertAddon = db.prepare(`
        INSERT INTO order_item_addons
            (order_item_id, addon_id, addon_name, addon_price, quantity, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    try {
        let total = 0;
        const orderItems = items.map(item => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid order item.');
            const productId = Number(item.product_id);
            const product = db.prepare(`
                SELECT product_id, product_name, price, is_available, is_archived
                FROM menu_products WHERE product_id = ?
            `).get(productId);
            if (!product || !product.is_available || product.is_archived) throw new Error('One or more products are unavailable.');

            const quantity = Number(item.quantity ?? 1);
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Invalid item quantity.');
            const unitPrice = Number(product.price);
            if (item.addons !== undefined && !Array.isArray(item.addons)) throw new Error('Invalid product options.');
            const itemAddons = Array.isArray(item.addons) ? item.addons : [];
            const verifiedAddons = itemAddons.map(addon => {
                if (!addon || typeof addon !== 'object' || Array.isArray(addon)) throw new Error('Invalid product option.');
                const name = typeof addon.addon_name === 'string' ? addon.addon_name.trim() : '';
                const addonQty = Number(addon.quantity ?? 1);
                if (!name || !Number.isInteger(addonQty) || addonQty < 1 || addonQty > 100) {
                    throw new Error('Invalid product option.');
                }
                let found;
                if (addon.addon_id != null) {
                    found = db.prepare(`
                        SELECT addon_id, addon_name, addon_price, is_available
                        FROM product_addons WHERE addon_id = ?
                    `).get(addon.addon_id);
                } else {
                    const lookup = name.replace(/^Flavor:\s*/i, '');
                    found = db.prepare(`
                        SELECT addon_id, addon_name, addon_price, is_available
                        FROM product_addons WHERE lower(addon_name) = lower(?)
                    `).get(lookup);
                }
                if (!found || !found.is_available || name.replace(/^Flavor:\s*/i, '').toLowerCase() !== found.addon_name.toLowerCase()) {
                    throw new Error(`Invalid or unavailable option: ${name}`);
                }
                const addonPrice = Number(found.addon_price);
                if (Number(addon.addon_price) !== addonPrice) throw new Error(`Option price changed: ${name}`);
                return { ...found, quantity: addonQty, subtotal: addonPrice * addonQty };
            });
            const subtotal = unitPrice * quantity;
            total += subtotal + verifiedAddons.reduce((sum, addon) => sum + addon.subtotal, 0);
            return { product, quantity, unitPrice, subtotal, addons: verifiedAddons };
        });

        const save = db.transaction(() => {
            const status = body.order_status || 'Pending';
            if (!['Pending', 'Preparing'].includes(status)) throw new Error('Invalid order status.');
            const branchName = branchFor(req);
            const inserted = insertOrder.run(
                typeof body.cust_name === 'string' ? body.cust_name.trim() || 'Walk-in Customer' : 'Walk-in Customer',
                typeof body.contact_number === 'string' ? body.contact_number : '',
                typeof body.other_contact === 'string' ? body.other_contact : '',
                status,
                total,
                typeof body.notes === 'string' ? body.notes : '',
                branchName,
                body.order_type === 'Take-Out' ? 'Take-Out' : 'Dine-In'
            );
            const orderId = Number(inserted.lastInsertRowid);
            for (const item of orderItems) {
                const itemResult = insertItem.run(
                    orderId, item.product.product_id, item.product.product_name,
                    item.unitPrice, item.quantity, item.subtotal
                );
                for (const addon of item.addons) {
                    insertAddon.run(itemResult.lastInsertRowid, addon.addon_id, addon.addon_name, addon.addon_price, addon.quantity, addon.subtotal);
                }
            }
            return orderId;
        });
        const orderId = save();
        res.json({ success: true, order_id: orderId, order_total: total, message: 'Order created successfully' });
    } catch (error) {
        if (error.message.startsWith('Invalid') || error.message.startsWith('One or more') || error.message.startsWith('Option price')) {
            return res.status(400).json({ success: false, error: error.message });
        }
        failure(res, error, 'Order creation error');
    }
}

function list(req, res) {
    try {
        const { startDate, endDate, branch, status, paymentMethod, search, todayOnly, today } = req.query;
        let sql = `
            SELECT o.*, p.payment_id, COALESCE(p.payment_method, 'Unpaid') AS payment_method,
                COALESCE(p.amount_due, o.order_total) AS amount_due, COALESCE(p.amount_paid, 0) AS amount_paid,
                COALESCE(p.change_amount, 0) AS change_amount, p.gcash_reference_number,
                COALESCE(p.payment_status, CASE WHEN o.order_status = 'Cancelled' THEN 'Failed' ELSE 'Pending' END) AS payment_status,
                p.paid_at, r.receipt_id, r.transaction_number, r.issued_at
            FROM orders o
            LEFT JOIN payments p ON o.order_id = p.order_id
            LEFT JOIN receipts r ON o.order_id = r.order_id
            WHERE 1 = 1
        `;
        const values = [];
        const effectiveBranch = isManager(req) ? branch : branchFor(req);
        if (effectiveBranch && effectiveBranch !== 'All Branches') {
            sql += ' AND o.branch_name = ?';
            values.push(effectiveBranch);
        }
        if (todayOnly === 'true' || today === '1') sql += " AND DATE(o.order_datetime, '+8 hours') = DATE('now', '+8 hours')";
        else {
            if (startDate) { sql += " AND DATE(o.order_datetime, '+8 hours') >= ?"; values.push(startDate); }
            if (endDate) { sql += " AND DATE(o.order_datetime, '+8 hours') <= ?"; values.push(endDate); }
        }
        if (status && status !== 'All') { sql += ' AND o.order_status = ?'; values.push(status); }
        if (paymentMethod && paymentMethod !== 'All') { sql += ' AND p.payment_method = ?'; values.push(paymentMethod); }
        if (search && String(search).trim()) {
            const query = `%${String(search).trim()}%`;
            sql += ' AND (o.cust_name LIKE ? OR CAST(o.order_id AS TEXT) LIKE ? OR r.transaction_number LIKE ? OR p.gcash_reference_number LIKE ?)';
            values.push(query, query, query, query);
        }
        sql += ' ORDER BY o.order_datetime DESC, o.order_id DESC LIMIT 500';
        const rows = db.prepare(sql).all(...values);
        const orders = rows.map(row => getOrderDetails(row));
        res.json({ success: true, count: orders.length, orders });
    } catch (error) {
        failure(res, error, 'Order list error');
    }
}

function get(req, res) {
    try {
        const order = canAccessOrder(req, res, req.params.id);
        if (order) res.json({ success: true, order: getOrderDetails(order) });
    } catch (error) {
        failure(res, error, 'Order fetch error');
    }
}

function update(req, res) {
    try {
        const order = canAccessOrder(req, res, req.params.id);
        if (!order) return;
        const { cust_name, contact_number, other_contact, notes, order_type, order_status, payment_status } = req.body || {};
        if (order_status !== undefined && !orderStatuses.includes(order_status)) {
            return res.status(400).json({ success: false, error: 'Invalid order_status value' });
        }
        if (order_type !== undefined && !['Dine-In', 'Take-Out', 'Phone', 'Online'].includes(order_type)) {
            return res.status(400).json({ success: false, error: 'Invalid order_type value' });
        }
        if (payment_status !== undefined && (!isManager(req) || !paymentStatuses.includes(payment_status))) {
            return res.status(isManager(req) ? 400 : 403).json({ success: false, error: 'Invalid payment_status value' });
        }
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries({ cust_name, contact_number, other_contact, notes, order_type, order_status })) {
            if (value !== undefined) { fields.push(`${key} = ?`); values.push(value); }
        }
        const save = db.transaction(() => {
            if (fields.length) {
                values.push(req.params.id);
                db.prepare(`UPDATE orders SET ${fields.join(', ')} WHERE order_id = ?`).run(...values);
            }
            if (payment_status !== undefined) {
                const existing = db.prepare('SELECT payment_id FROM payments WHERE order_id = ?').get(req.params.id);
                if (existing) {
                    db.prepare('UPDATE payments SET payment_status = ? WHERE payment_id = ?').run(payment_status, existing.payment_id);
                } else {
                    const amount = payment_status === 'Verified' ? order.order_total : 0;
                    db.prepare(`
                        INSERT INTO payments
                            (order_id, payment_method, amount_due, amount_paid, change_amount, payment_status)
                        VALUES (?, 'Cash', ?, ?, 0, ?)
                    `).run(req.params.id, order.order_total, amount, payment_status);
                }
            }
        });
        save();
        res.json({ success: true, message: 'Order updated successfully' });
    } catch (error) {
        failure(res, error, 'Order update error');
    }
}

function updateStatus(req, res) {
    try {
        const order = canAccessOrder(req, res, req.params.id);
        if (!order) return;
        const { order_status, payment_status } = req.body || {};
        if (order_status && !orderStatuses.includes(order_status)) {
            return res.status(400).json({ success: false, error: 'Invalid order_status value' });
        }
        if (payment_status && !paymentStatuses.includes(payment_status)) {
            return res.status(400).json({ success: false, error: 'Invalid payment_status value' });
        }
        if (payment_status && !isManager(req) && !(order_status === 'Cancelled' && payment_status === 'Failed')) {
            return res.sendStatus(403);
        }
        const update = db.transaction(() => {
            if (order_status) db.prepare('UPDATE orders SET order_status = ? WHERE order_id = ?').run(order_status, req.params.id);
            if (payment_status) db.prepare('UPDATE payments SET payment_status = ? WHERE order_id = ?').run(payment_status, req.params.id);
        });
        update();
        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        failure(res, error, 'Order status update error');
    }
}

async function pay(req, res) {
    try {
        const order = canAccessOrder(req, res, req.params.id);
        if (!order) return;
        if (order.order_status === 'Cancelled') {
            return res.status(409).json({ success: false, error: 'Cancelled orders cannot be paid.' });
        }
        const { payment_method, amount_paid, gcash_reference_number, paymongo_link_id, receipt_type } = req.body || {};
        if (db.prepare("SELECT 1 FROM payments WHERE order_id = ? AND payment_status = 'Verified'").get(req.params.id)) {
            return res.status(409).json({ success: false, error: 'This order already has a verified payment.' });
        }
        if (!['Cash', 'GCash'].includes(payment_method)) {
            return res.status(400).json({ success: false, error: 'Invalid payment method' });
        }
        const due = Number(order.order_total);
        const paid = Number(amount_paid === undefined ? due : amount_paid);
        if (!Number.isFinite(paid) || paid < due || (payment_method === 'GCash' && paid !== due)) {
            return res.status(400).json({ success: false, error: 'Payment amount must cover the order total' });
        }
        let verifiedReference = null;
        if (payment_method === 'GCash') {
            if (!paymongo_link_id || paymongo_link_id !== order.paymongo_link_id) {
                return res.status(400).json({ success: false, error: 'Create a PayMongo payment link for this order first.' });
            }
            let verification;
            try {
                verification = await paymongo.verifyPaidLink(paymongo_link_id, due);
            } catch (error) {
                console.error('GCash verification error:', error);
                const status = error.message.includes('not configured') ? 503 : 502;
                return res.status(status).json({ success: false, error: 'Unable to verify GCash payment with PayMongo.' });
            }
            if (!verification.isPaid) {
                return res.status(409).json({ success: false, error: 'PayMongo has not confirmed this payment yet.' });
            }
            verifiedReference = verification.referenceNumber;
            if (gcash_reference_number && verifiedReference && gcash_reference_number !== verifiedReference) {
                return res.status(400).json({ success: false, error: 'The GCash reference does not match the verified payment.' });
            }
        }
        const change = payment_method === 'Cash' ? paid - due : 0;

        const processPayment = db.transaction(() => {
            const existing = db.prepare('SELECT payment_id FROM payments WHERE order_id = ?').get(req.params.id);
            let paymentId;
            if (existing) {
                const verified = db.prepare("SELECT 1 FROM payments WHERE payment_id = ? AND payment_status = 'Verified'").get(existing.payment_id);
                if (verified) {
                    const error = new Error('This order already has a verified payment.');
                    error.code = 'PAYMENT_ALREADY_VERIFIED';
                    throw error;
                }
                paymentId = existing.payment_id;
                db.prepare(`
                    UPDATE payments SET payment_method = ?, amount_due = ?, amount_paid = ?, change_amount = ?,
                        gcash_reference_number = ?, payment_status = 'Verified', paid_at = CURRENT_TIMESTAMP
                    WHERE payment_id = ?
                `).run(payment_method, due, paid, change, verifiedReference, paymentId);
            } else {
                const result = db.prepare(`
                    INSERT INTO payments
                        (order_id, payment_method, amount_due, amount_paid, change_amount, gcash_reference_number, payment_status, paid_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'Verified', CURRENT_TIMESTAMP)
                `).run(req.params.id, payment_method, due, paid, change, verifiedReference);
                paymentId = Number(result.lastInsertRowid);
            }
            const existingReceipt = db.prepare('SELECT receipt_id, transaction_number FROM receipts WHERE order_id = ?').get(req.params.id);
            const number = existingReceipt?.transaction_number || `TXN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(randomInt(0, 10000)).padStart(4, '0')}`;
            let receiptId;
            if (existingReceipt) {
                receiptId = existingReceipt.receipt_id;
                db.prepare('UPDATE receipts SET payment_id = ?, issued_at = CURRENT_TIMESTAMP WHERE receipt_id = ?').run(paymentId, receiptId);
            } else {
                const receipt = db.prepare(`
                    INSERT INTO receipts (order_id, payment_id, transaction_number, receipt_type)
                    VALUES (?, ?, ?, ?)
                `).run(req.params.id, paymentId, number, receipt_type === 'Digital' ? 'Digital' : 'Printed');
                receiptId = Number(receipt.lastInsertRowid);
            }
            db.prepare("UPDATE orders SET order_status = 'Completed' WHERE order_id = ?").run(req.params.id);
            return { paymentId, receiptId, number };
        });
        const receipt = processPayment();
        res.json({
            success: true,
            payment_id: receipt.paymentId,
            transaction_number: receipt.number,
            receipt_id: receipt.receiptId,
            change_amount: change,
            message: 'Payment verified and receipt generated',
        });
    } catch (error) {
        if (error.code === 'PAYMENT_ALREADY_VERIFIED') {
            return res.status(409).json({ success: false, error: error.message });
        }
        failure(res, error, 'Payment processing error');
    }
}

module.exports = { create, list, get, update, updateStatus, pay };
