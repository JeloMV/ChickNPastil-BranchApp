const db = require('../../lib/database');

function stats(req, res) {
    try {
        const manager = ['admin', 'manager'].includes((req.session?.user?.role || '').toLowerCase());
        const requestedBranch = typeof req.query.branch === 'string' ? req.query.branch : '';
        const branch = manager ? requestedBranch : req.session.user.branchLocationName;
        const filters = [];
        const values = [];
        if (branch && branch !== 'All Branches') {
            filters.push('o.branch_name = ?');
            values.push(branch);
        }
        if (req.query.filter === 'today') filters.push("DATE(o.order_datetime, '+8 hours') = DATE('now', '+8 hours')");
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const orders = db.prepare(`
            SELECT o.order_id, o.order_total, o.order_status, p.payment_method, p.payment_status
            FROM orders o
            LEFT JOIN payments p ON p.order_id = o.order_id
            ${where}
        `).all(...values);

        const summary = {
            totalOrders: orders.length,
            totalSalesRevenue: 0,
            totalCash: 0,
            totalGCash: 0,
        };
        for (const order of orders) {
            if (order.order_status === 'Cancelled') continue;
            const total = Number(order.order_total) || 0;
            summary.totalSalesRevenue += total;
            if (order.payment_status === 'Verified' && order.payment_method === 'Cash') summary.totalCash += total;
            if (order.payment_status === 'Verified' && order.payment_method === 'GCash') summary.totalGCash += total;
        }

        const branchLabel = branch && branch !== 'All Branches' ? branch : 'All Branches';
        const surgeValues = [];
        let surgeWhere = "WHERE order_datetime >= datetime('now', '-1 hour') AND order_status != 'Cancelled'";
        if (branch && branch !== 'All Branches') {
            surgeWhere += ' AND branch_name = ?';
            surgeValues.push(branch);
        }
        const surge = db.prepare(`SELECT COUNT(*) AS count FROM orders ${surgeWhere}`).get(...surgeValues);
        const alerts = [{
            type: surge.count >= 5 ? 'warning' : 'info',
            title: `${branchLabel}: ${surge.count >= 5 ? 'High Sales Velocity' : 'Standard Sales Rate'}`,
            message: `${surge.count} order(s) placed in the past 60 minutes.`,
        }];

        const demandValues = [];
        let demandWhere = "WHERE DATE(o.order_datetime, '+8 hours') = DATE('now', '+8 hours') AND o.order_status != 'Cancelled'";
        if (branch && branch !== 'All Branches') {
            demandWhere += ' AND o.branch_name = ?';
            demandValues.push(branch);
        }
        const topItem = db.prepare(`
            SELECT oi.item_name AS product_name, SUM(oi.quantity) AS sold_qty
            FROM order_items oi JOIN orders o ON oi.order_id = o.order_id
            ${demandWhere}
            GROUP BY oi.item_name ORDER BY sold_qty DESC LIMIT 1
        `).get(...demandValues);
        if (topItem && topItem.sold_qty >= 5) {
            alerts.push({
                type: 'warning',
                title: `${branchLabel}: Fast-Moving Product Alert`,
                message: `${topItem.product_name} has reached ${topItem.sold_qty} units sold today.`,
            });
        }

        res.json({
            success: true,
            branch: branch || 'All Branches',
            ...summary,
            total_orders: summary.totalOrders,
            total_revenue: summary.totalSalesRevenue,
            total_cash: summary.totalCash,
            total_gcash: summary.totalGCash,
            alerts,
        });
    } catch (error) {
        console.error('Sales dashboard stats error:', error);
        res.status(500).json({ success: false, error: 'Unable to load sales dashboard.' });
    }
}

module.exports = { stats };
