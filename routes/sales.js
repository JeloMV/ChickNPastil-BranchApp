const express = require('express');
const path = require('path');
const menu = require('../controllers/sales/menu');
const orders = require('../controllers/sales/orders');
const dashboard = require('../controllers/sales/dashboard');
const paymongo = require('../controllers/sales/paymongo');
const analytics = require('../controllers/sales/analytics');

const pages = express.Router();
const api = express.Router();
const isManager = req => ['admin', 'manager'].includes((req.session?.user?.role || '').toLowerCase());
const requireManager = (req, res, next) => {
    if (!isManager(req)) return res.sendStatus(403);
    next();
};

function sendPage(relativePath, managerOnly = false) {
    return (req, res, next) => {
        if (managerOnly && !isManager(req)) return res.sendStatus(403);
        res.sendFile(path.join(__dirname, '../app/pages/sales', relativePath), err => {
            if (err) next(err);
        });
    };
}

pages.get('/', (req, res) => {
    res.redirect(isManager(req) ? '/sales/manager/dashboard' : '/sales/staff/dashboard');
});
pages.get('/manager/dashboard', sendPage('manager/dashboard.html', true));
pages.get('/manager/menu', sendPage('manager/menu.html', true));
pages.get('/manager/transactions', sendPage('manager/transaction_reports.html', true));
pages.get('/staff/dashboard', (req, res, next) => {
    if (isManager(req)) return res.redirect('/sales/manager/dashboard');
    return sendPage('staff/dashboard.html')(req, res, next);
});
pages.get('/staff/transactions', (req, res, next) => {
    if (isManager(req)) return res.redirect('/sales/manager/transactions');
    return sendPage('staff/transactions.html')(req, res, next);
});
pages.get('/pos/ordering', sendPage('pos/ordering.html'));
api.get('/menu', menu.list);
api.get('/menu/addons', menu.listAddons);
api.post('/menu/section', requireManager, menu.createSection);
api.put('/menu/section/:id', requireManager, menu.updateSection);
api.put('/menu/section/:id/archive', requireManager, menu.toggleSectionArchive);
api.post('/menu/product', requireManager, menu.createProduct);
api.put('/menu/product/:id', requireManager, menu.updateProduct);
api.put('/menu/product/:id/availability', requireManager, menu.toggleProductAvailability);
api.put('/menu/product/:id/archive', requireManager, menu.toggleProductArchive);

api.post('/orders', orders.create);
api.get('/orders', orders.list);
api.get('/orders/:id', orders.get);
api.patch('/orders/:id', orders.update);
api.patch('/orders/:id/status', orders.updateStatus);
api.post('/orders/:id/pay', orders.pay);

api.get('/dashboard/stats', dashboard.stats);
api.get('/analytics/summary', requireManager, analytics.summary);
api.post('/paymongo/create-link', paymongo.createLink);
api.get('/paymongo/check-status/:linkId', paymongo.checkStatus);
api.post('/paymongo/webhook', paymongo.webhook);

module.exports = { pages, api };