const express = require('express');
const path = require('path');
const inventory = require('../controllers/supply/inventory');
const requestStock = require('../controllers/supply/request_stock');
const requestExpenses = require('../controllers/supply/request_expenses');
const manageExpenses = require('../controllers/supply/manage_expenses');
const manageRequest = require('../controllers/supply/manage_request');
const receiveStock = require('../controllers/supply/receive_stock');

const router = express.Router();

const requireFulfillmentManager = (req, res, next) => {
    const role = (req.session?.user?.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'manager') {
        return res.sendStatus(403);
    }
    next();
};

router.get('/inventory', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/supply/inventory.html'));
}); 
router.get('/request_stock', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/supply/request_stock.html'));
});
router.get('/request_expenses', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/supply/request_expenses.html'));
});
router.get('/receive_stock', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/supply/receive_stock.html'));
});
router.get('/manage_request', requireFulfillmentManager, (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/supply/manage_request.html'));
});
router.get('/manage_expenses', requireFulfillmentManager, (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/supply/manage_expenses.html'));
});

router.get('/inventory/data', inventory.getInventory);
router.get('/inventory/received-log', inventory.getReceivedLogs);
router.get('/inventory/received-log/:id', inventory.getReceivedLogDetails);
router.post('/inventory/items', inventory.addInventoryItem);
router.put('/inventory/items/:id/settings', inventory.updateItemSettings);
router.put('/inventory/items/:id/stock', inventory.updateStock);

router.get('/request_stock/data', requestStock.getRequestData);
router.put('/request_stock/confirm-inventory', requestStock.confirmInventory);
router.post('/request_stock', requestStock.createRequest);

router.get('/request_expenses/data', requestExpenses.getRequestData);
router.get('/request_expenses/requests', requestExpenses.getRequests);
router.get('/request_expenses/requests/:id', requestExpenses.getRequestDetails);
router.put('/request_expenses/requests/:id/complete', requestExpenses.completeRequest);
router.post('/request_expenses', requestExpenses.createRequest);

router.get('/receive_stock/data', receiveStock.getRequests);
router.put('/receive_stock/:id/cancel', receiveStock.cancelRequest);
router.post('/receive_stock/:id/receive', receiveStock.receiveDelivery);

router.get('/manage_request/data', requireFulfillmentManager, manageRequest.getRequests);
router.put('/manage_request/:id/status', requireFulfillmentManager, manageRequest.updateStatus);

router.get('/manage_expenses/data', requireFulfillmentManager, manageExpenses.getAllRequests);
router.get('/manage_expenses/auto-approval', requireFulfillmentManager, manageExpenses.getAutoApprovalSetting);
router.put('/manage_expenses/auto-approval', requireFulfillmentManager, manageExpenses.updateAutoApprovalSetting);
router.get('/manage_expenses/requests/:id', requireFulfillmentManager, manageExpenses.getManagedRequestDetails);
router.put('/manage_expenses/requests/:id/status', requireFulfillmentManager, manageExpenses.updateManagedRequestStatus);

module.exports = router;