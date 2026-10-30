const db = require('../../lib/database');

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const periodFormats = { day: '%Y-%m-%d', week: '%Y-W%W', month: '%Y-%m' };

function summary(req, res) {
    try {
        // Only count real sales; times are stored in UTC, so shift to Manila (+8).
        const where = "WHERE order_status != 'Cancelled'";
        const period = periodFormats[req.query.period] ? req.query.period : 'month';

        const peakHour = db.prepare(`
            SELECT CAST(strftime('%H', order_datetime, '+8 hours') AS INTEGER) AS hour,
                   SUM(order_total) AS total, COUNT(*) AS orders
            FROM orders ${where}
            GROUP BY hour ORDER BY total DESC LIMIT 1
        `).get();

        const peakDay = db.prepare(`
            SELECT CAST(strftime('%w', order_datetime, '+8 hours') AS INTEGER) AS day,
                   SUM(order_total) AS total, COUNT(*) AS orders
            FROM orders ${where}
            GROUP BY day ORDER BY total DESC LIMIT 1
        `).get();

        const topBranch = db.prepare(`
            SELECT branch_name AS branch, SUM(order_total) AS total, COUNT(*) AS orders
            FROM orders ${where}
            GROUP BY branch_name ORDER BY total DESC LIMIT 1
        `).get();

        const bestPeriod = db.prepare(`
            SELECT strftime('${periodFormats[period]}', order_datetime, '+8 hours') AS label,
                   SUM(order_total) AS total, COUNT(*) AS orders
            FROM orders ${where}
            GROUP BY label ORDER BY total DESC LIMIT 1
        `).get();

        res.json({
            success: true,
            peakHour: peakHour && { ...peakHour, label: `${peakHour.hour % 12 || 12}:00 ${peakHour.hour < 12 ? 'AM' : 'PM'}` },
            peakDay: peakDay && { ...peakDay, label: days[peakDay.day] },
            topBranch: topBranch || null,
            bestPeriod: bestPeriod && { ...bestPeriod, period },
        });
    } catch (error) {
        console.error('Sales analytics error:', error);
        res.status(500).json({ success: false, error: 'Unable to load sales analytics.' });
    }
}

module.exports = { summary };