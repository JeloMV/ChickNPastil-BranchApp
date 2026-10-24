const db = require('../../lib/database');

const apiBase = 'https://api.paymongo.com/v1';

function authorization() {
    const secret = process.env.PAYMONGO_SECRET_KEY;
    if (!secret) throw new Error('PayMongo is not configured. Set PAYMONGO_SECRET_KEY.');
    return `Basic ${Buffer.from(`${secret}:`).toString('base64')}`;
}

async function request(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
            Authorization: authorization(),
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    const body = await response.json();
    if (!response.ok) {
        const detail = body?.errors?.[0]?.detail || `PayMongo returned HTTP ${response.status}.`;
        throw new Error(detail);
    }
    return body.data;
}

function apiError(res, error) {
    console.error('PayMongo request error:', error);
    const status = error.message.includes('not configured') ? 503 : 502;
    res.status(status).json({ success: false, error: error.message });
}

async function createLink(req, res) {
    const orderId = Number((req.body || {}).order_id);
    if (!Number.isInteger(orderId)) return res.status(400).json({ success: false, error: 'Valid order ID is required' });
    const order = db.prepare('SELECT order_id, order_total, branch_name FROM orders WHERE order_id = ?').get(orderId);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (!(Number(order.order_total) > 0)) {
        return res.status(400).json({ success: false, error: 'A payment link requires a positive order total.' });
    }
    if (order.order_status === 'Cancelled' || db.prepare(`
        SELECT 1 FROM payments WHERE order_id = ? AND payment_status = 'Verified'
    `).get(orderId)) {
        return res.status(409).json({ success: false, error: 'This order cannot accept another payment link.' });
    }
    const manager = ['admin', 'manager'].includes((req.session?.user?.role || '').toLowerCase());
    if (!manager && order.branch_name !== req.session.user.branchLocationName) return res.sendStatus(403);

    try {
        const link = await request('/links', {
            method: 'POST',
            body: JSON.stringify({
                data: {
                    attributes: {
                        amount: Math.round(Number(order.order_total) * 100),
                        description: `Chick N Pastil Order #${String(orderId).padStart(4, '0')}`,
                        remarks: `${order.branch_name} - POS`,
                    },
                },
            }),
        });
        const checkoutUrl = link.attributes.checkout_url;
        if (!checkoutUrl || new URL(checkoutUrl).protocol !== 'https:') {
            throw new Error('PayMongo returned an invalid checkout URL.');
        }
        db.prepare('UPDATE orders SET paymongo_link_id = ? WHERE order_id = ?').run(link.id, orderId);
        res.json({
            success: true,
            checkoutUrl,
            linkId: link.id,
            referenceNumber: link.attributes.reference_number,
            status: link.attributes.status,
        });
    } catch (error) {
        apiError(res, error);
    }
}

async function checkStatus(req, res) {
    const order = db.prepare('SELECT branch_name FROM orders WHERE paymongo_link_id = ?').get(req.params.linkId);
    if (!order) return res.status(404).json({ success: false, error: 'Payment link not found' });
    const manager = ['admin', 'manager'].includes((req.session?.user?.role || '').toLowerCase());
    if (!manager && order.branch_name !== req.session.user.branchLocationName) return res.sendStatus(403);
    try {
        const link = await request(`/links/${encodeURIComponent(req.params.linkId)}`);
        const isPaid = link.attributes.status === 'paid' || (link.attributes.payments || []).length > 0;
        const payment = link.attributes.payments?.[0]?.data?.attributes;
        res.json({
            success: true,
            linkId: link.id,
            status: link.attributes.status,
            isPaid,
            referenceNumber: link.attributes.reference_number,
            paymentId: payment?.id,
            paidAt: payment?.paid_at ? new Date(payment.paid_at * 1000) : null,
        });
    } catch (error) {
        apiError(res, error);
    }
}

async function verifyPaidLink(linkId, expectedAmount) {
    const link = await request(`/links/${encodeURIComponent(linkId)}`);
    const attributes = link.attributes;
    if (attributes.status !== 'paid') {
        return { isPaid: false };
    }
    if (Number(attributes.amount) !== Math.round(expectedAmount * 100)) {
        throw new Error('The PayMongo payment amount does not match the order total.');
    }
    return {
        isPaid: true,
        referenceNumber: attributes.reference_number || null,
    };
}

function webhook(req, res) {
    const eventType = req.body?.data?.attributes?.type;
    if (!eventType) return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
    console.log('Received PayMongo webhook event:', eventType);
    res.json({ received: true });
}

module.exports = { createLink, checkStatus, verifyPaidLink, webhook };
