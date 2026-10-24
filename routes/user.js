const express = require('express');
const path = require('path');
const login = require('../controllers/user/login');
const admin = require('../controllers/user/manager');
const profile = require('../controllers/user/profile');

const router = express.Router();

const requireAdminORManager = (req, res, next) => {
    const role = (req.session?.user?.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'manager') {
        return res.sendStatus(403);
    }
    next();
};

router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/user/login.html'));
});
router.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/user/profile.html'));
});
router.get('/manager', requireAdminORManager, (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/user/manager.html'));
});

router.get('/manager/users', admin.listUsers);
router.post('/manager/users', admin.createUser);
router.put('/manager/users/:id', admin.updateUser);
router.get('/manager/branches', admin.listBranches);
router.post('/manager/branches', admin.createBranch);
router.put('/manager/branches/:id', admin.updateBranch);
router.get('/manager/stock-items', admin.listStockItems);
router.post('/manager/stock-items', admin.createStockItem);
router.put('/manager/stock-items/:id', admin.updateStockItem);

router.get('/session', login.getSessionDetails);
router.post('/check_pass', login.checkPassword);
router.post('/verify_email', login.verifyEmail);
router.post('/start_session', login.startSession);

router.get('/profile/details', profile.getDetails);
router.post('/profile/password', profile.updatePassword);
router.post('/profile/deactivate', profile.deactivate);
router.post('/logout', profile.logout);

module.exports = router;