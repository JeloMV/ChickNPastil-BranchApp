const userModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('userModal'));
const branchModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('branchModal'));
const stockItemModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('stockItemModal'));
const userForm = document.getElementById('userForm');
const branchForm = document.getElementById('branchForm');
const stockItemForm = document.getElementById('stockItemForm');
const usersTableBody = document.getElementById('usersTableBody');
const branchesTableBody = document.getElementById('branchesTableBody');
const stockItemsTableBody = document.getElementById('stockItemsTableBody');

let users = [];
let branches = [];
let stockItems = [];

const showAlert = (message, type = 'success') => {
    const alert = document.getElementById('adminAlert');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alert.classList.remove('d-none');
    window.clearTimeout(showAlert.timeoutId);
    showAlert.timeoutId = window.setTimeout(() => alert.classList.add('d-none'), 5000);
};

const request = async (url, options = {}) => {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers,
        },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.message || `Request failed (${response.status}).`);
    }
    return result;
};

const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

const statusBadge = (status) => element(
    'span',
    status === 'active' ? 'badge bg-success-subtle text-success-emphasis' : 'badge bg-secondary-subtle text-secondary-emphasis',
    status === 'active' ? 'Active' : 'Inactive',
);

const actionButton = (label, icon, className, handler, disabled = false) => {
    const button = element('button', `btn btn-sm ${className}`);
    button.type = 'button';
    button.disabled = disabled;
    button.setAttribute('aria-label', label);
    const iconElement = element('i', `bi ${icon} me-1`);
    iconElement.setAttribute('aria-hidden', 'true');
    button.append(iconElement, document.createTextNode(label));
    button.addEventListener('click', handler);
    return button;
};

const formatDate = (date) => {
    if (!date) return '—';
    const parsed = new Date(date.replace(' ', 'T') + (date.includes('Z') ? '' : 'Z'));
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(parsed);
};

const setEmptyRow = (tbody, columns, message) => {
    const row = document.createElement('tr');
    const cell = element('td', 'text-center py-5 text-secondary', message);
    cell.colSpan = columns;
    row.append(cell);
    tbody.replaceChildren(row);
};

const updateCounts = () => {
    document.getElementById('userCount').textContent = users.length;
    document.getElementById('activeUserCount').textContent = users.filter((user) => user.status === 'active').length;
    document.getElementById('branchCount').textContent = branches.length;
    document.getElementById('activeBranchCount').textContent = branches.filter((branch) => branch.status === 'active').length;
    document.getElementById('stockItemCount').textContent = stockItems.length;
    document.getElementById('activeStockItemCount').textContent = stockItems.filter((item) => item.status === 'active').length;
};

const getUserSearchText = (user) =>
    [user.first_name, user.last_name, user.email, user.role].filter(Boolean).join(' ').toLowerCase();

const renderUsers = () => {
    const query = document.getElementById('userSearch').value.trim().toLowerCase();
    const filteredUsers = users.filter((user) => getUserSearchText(user).includes(query));
    usersTableBody.replaceChildren();

    if (filteredUsers.length === 0) {
        setEmptyRow(usersTableBody, 5, users.length ? 'No accounts match your search.' : 'No staff accounts found.');
    } else {
        filteredUsers.forEach((user) => {
            const row = document.createElement('tr');
            const memberCell = element('th', 'ps-3 fw-medium');
            memberCell.scope = 'row';
            memberCell.append(element('span', '', `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Name not set'));
            memberCell.append(element('small', 'd-block text-secondary fw-normal', user.email));
            const roleCell = element('td', 'text-capitalize', user.role);
            const dateCell = element('td', 'text-nowrap text-secondary', formatDate(user.created_at));
            const statusCell = element('td');
            statusCell.append(statusBadge(user.status));
            const actionsCell = element('td', 'text-end pe-3 text-nowrap');

            actionsCell.append(actionButton('Edit', 'bi-pencil', 'btn-outline-primary me-1', () => openUserModal(user)));
            actionsCell.append(actionButton(
                user.status === 'active' ? 'Deactivate' : 'Activate',
                user.status === 'active' ? 'bi-person-dash' : 'bi-person-check',
                user.status === 'active' ? 'btn-outline-danger' : 'btn-outline-success',
                () => toggleUserStatus(user),
            ));
            row.append(memberCell, roleCell, dateCell, statusCell, actionsCell);
            usersTableBody.append(row);
        });
    }

    document.getElementById('usersSummary').textContent = `Showing ${filteredUsers.length} of ${users.length} account${users.length === 1 ? '' : 's'}`;
    updateCounts();
};

const getBranchSearchText = (branch) => `${branch.location_name} ${branch.address}`.toLowerCase();

const renderBranches = () => {
    const query = document.getElementById('branchSearch').value.trim().toLowerCase();
    const filteredBranches = branches.filter((branch) => getBranchSearchText(branch).includes(query));
    branchesTableBody.replaceChildren();

    if (filteredBranches.length === 0) {
        setEmptyRow(branchesTableBody, 4, branches.length ? 'No branches match your search.' : 'No branch locations found.');
    } else {
        filteredBranches.forEach((branch) => {
            const row = document.createElement('tr');
            const nameCell = element('th', 'ps-3 fw-medium', branch.location_name);
            nameCell.scope = 'row';
            const addressCell = element('td', '', branch.address);
            const statusCell = element('td');
            statusCell.append(statusBadge(branch.status));
            const actionsCell = element('td', 'text-end pe-3 text-nowrap');

            actionsCell.append(actionButton('Edit', 'bi-pencil', 'btn-outline-primary me-1', () => openBranchModal(branch)));
            actionsCell.append(actionButton(
                branch.status === 'active' ? 'Deactivate' : 'Activate',
                branch.status === 'active' ? 'bi-pause-circle' : 'bi-play-circle',
                branch.status === 'active' ? 'btn-outline-danger' : 'btn-outline-success',
                () => toggleBranchStatus(branch),
            ));
            row.append(nameCell, addressCell, statusCell, actionsCell);
            branchesTableBody.append(row);
        });
    }

    document.getElementById('branchesSummary').textContent = `Showing ${filteredBranches.length} of ${branches.length} branch location${branches.length === 1 ? '' : 's'}`;
    updateCounts();
};

const renderStockItems = () => {
    const query = document.getElementById('stockItemSearch').value.trim().toLowerCase();
    const filteredItems = stockItems.filter((item) =>
        `${item.name} ${item.unit_type}`.toLowerCase().includes(query)
    );
    stockItemsTableBody.replaceChildren();

    if (filteredItems.length === 0) {
        setEmptyRow(stockItemsTableBody, 5, stockItems.length ? 'No stock items match your search.' : 'No general stock items found.');
    } else {
        filteredItems.forEach((item) => {
            const row = document.createElement('tr');
            const nameCell = element('th', 'ps-3 fw-medium', item.name);
            nameCell.scope = 'row';
            const unitCell = element('td', 'text-capitalize', item.unit_type);
            const costCell = element('td', 'text-nowrap', new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency: 'PHP',
            }).format(item.unit_cost));
            const statusCell = element('td');
            statusCell.append(statusBadge(item.status));
            const actionsCell = element('td', 'text-end pe-3 text-nowrap');

            actionsCell.append(actionButton('Edit', 'bi-pencil', 'btn-outline-primary me-1', () => openStockItemModal(item)));
            actionsCell.append(actionButton(
                item.status === 'active' ? 'Deactivate' : 'Activate',
                item.status === 'active' ? 'bi-pause-circle' : 'bi-play-circle',
                item.status === 'active' ? 'btn-outline-danger' : 'btn-outline-success',
                () => toggleStockItemStatus(item),
            ));
            row.append(nameCell, unitCell, costCell, statusCell, actionsCell);
            stockItemsTableBody.append(row);
        });
    }

    document.getElementById('stockItemsSummary').textContent =
        `Showing ${filteredItems.length} of ${stockItems.length} general stock item${stockItems.length === 1 ? '' : 's'}`;
    updateCounts();
};

const loadUsers = async () => {
    const result = await request('/user/manager/users');
    users = result.users;
    renderUsers();
};

const loadBranches = async () => {
    const result = await request('/user/manager/branches');
    branches = result.branches;
    renderBranches();
};

const loadStockItems = async () => {
    const result = await request('/user/manager/stock-items');
    stockItems = result.stockItems;
    renderStockItems();
};

const openUserModal = (user) => {
    userForm.reset();
    document.getElementById('userFormError').textContent = '';
    document.getElementById('userId').value = user ? user.id : '';
    document.getElementById('userModalTitle').textContent = user ? 'Edit staff account' : 'Add staff account';
    document.getElementById('saveUserButton').textContent = user ? 'Save changes' : 'Create account';
    document.getElementById('userPassword').required = !user;
    document.getElementById('passwordHint').textContent = user ? '(leave blank to keep current)' : '(required for new accounts)';
    if (user) {
        document.getElementById('firstName').value = user.first_name || '';
        document.getElementById('lastName').value = user.last_name || '';
        document.getElementById('userEmail').value = user.email;
        document.getElementById('userRole').value = user.role;
        if (document.getElementById('userRole').value !== user.role) {
            const roleOption = element('option', '', user.role);
            roleOption.value = user.role;
            document.getElementById('userRole').append(roleOption);
            document.getElementById('userRole').value = user.role;
        }
        document.getElementById('userStatus').value = user.status;
    }
    userModal.show();
};

const openBranchModal = (branch) => {
    branchForm.reset();
    document.getElementById('branchFormError').textContent = '';
    document.getElementById('branchId').value = branch ? branch.id : '';
    document.getElementById('branchModalTitle').textContent = branch ? 'Edit branch location' : 'Add branch location';
    document.getElementById('saveBranchButton').textContent = branch ? 'Save changes' : 'Create branch';
    if (branch) {
        document.getElementById('branchName').value = branch.location_name;
        document.getElementById('branchAddress').value = branch.address;
        document.getElementById('branchStatus').value = branch.status;
    }
    branchModal.show();
};

const openStockItemModal = (item) => {
    stockItemForm.reset();
    document.getElementById('stockItemFormError').textContent = '';
    document.getElementById('stockItemId').value = item ? item.id : '';
    document.getElementById('stockItemModalTitle').textContent = item ? 'Edit general stock item' : 'Add general stock item';
    document.getElementById('saveStockItemButton').textContent = item ? 'Save changes' : 'Create item';
    if (item) {
        document.getElementById('stockItemName').value = item.name;
        document.getElementById('stockItemUnitType').value = item.unit_type;
        document.getElementById('stockItemUnitCost').value = item.unit_cost;
        document.getElementById('stockItemStatus').value = item.status;
    }
    stockItemModal.show();
};

const toggleUserStatus = async (user) => {
    const nextStatus = user.status === 'active' ? 'inactive' : 'active';
    if (!window.confirm(`${nextStatus === 'inactive' ? 'Deactivate' : 'Activate'} ${user.email}?`)) return;
    try {
        await request(`/user/manager/users/${user.id}`, {
            method: 'PUT',
            body: JSON.stringify({ ...user, status: nextStatus }),
        });
        await loadUsers();
        showAlert(`Account ${nextStatus === 'active' ? 'activated' : 'deactivated'}.`);
    } catch (error) {
        showAlert(error.message, 'danger');
    }
};

const toggleBranchStatus = async (branch) => {
    const nextStatus = branch.status === 'active' ? 'inactive' : 'active';
    if (!window.confirm(`${nextStatus === 'inactive' ? 'Deactivate' : 'Activate'} ${branch.location_name}?`)) return;
    try {
        await request(`/user/manager/branches/${branch.id}`, {
            method: 'PUT',
            body: JSON.stringify({ ...branch, status: nextStatus }),
        });
        await loadBranches();
        showAlert(`Branch ${nextStatus === 'active' ? 'activated' : 'deactivated'}.`);
    } catch (error) {
        showAlert(error.message, 'danger');
    }
};

const toggleStockItemStatus = async (item) => {
    const nextStatus = item.status === 'active' ? 'inactive' : 'active';
    if (!window.confirm(`${nextStatus === 'inactive' ? 'Deactivate' : 'Activate'} ${item.name}?`)) return;
    try {
        await request(`/user/manager/stock-items/${item.id}`, {
            method: 'PUT',
            body: JSON.stringify({ ...item, status: nextStatus }),
        });
        await loadStockItems();
        showAlert(`Stock item ${nextStatus === 'active' ? 'activated' : 'deactivated'}.`);
    } catch (error) {
        showAlert(error.message, 'danger');
    }
};

document.getElementById('addRecordButton').addEventListener('click', () => {
    if (document.getElementById('branches-tab').classList.contains('active')) {
        openBranchModal();
    } else if (document.getElementById('stock-items-tab').classList.contains('active')) {
        openStockItemModal();
    } else {
        openUserModal();
    }
});

document.getElementById('branches-tab').addEventListener('shown.bs.tab', () => {
    document.getElementById('addRecordLabel').textContent = 'Add branch location';
});

document.getElementById('stock-items-tab').addEventListener('shown.bs.tab', () => {
    document.getElementById('addRecordLabel').textContent = 'Add stock item';
});

document.getElementById('users-tab').addEventListener('shown.bs.tab', () => {
    document.getElementById('addRecordLabel').textContent = 'Add staff account';
});

document.getElementById('userSearch').addEventListener('input', renderUsers);
document.getElementById('branchSearch').addEventListener('input', renderBranches);
document.getElementById('stockItemSearch').addEventListener('input', renderStockItems);

userForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('userId').value;
    const payload = Object.fromEntries(new FormData(userForm).entries());
    document.getElementById('userFormError').textContent = '';
    const saveButton = document.getElementById('saveUserButton');
    saveButton.disabled = true;

    try {
        await request(id ? `/user/manager/users/${id}` : '/user/manager/users', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(payload),
        });
        userModal.hide();
        showAlert(id ? 'Staff account updated.' : 'Staff account created.');
        loadUsers().catch((error) => showAlert(error.message, 'danger'));
    } catch (error) {
        document.getElementById('userFormError').textContent = error.message;
    } finally {
        saveButton.disabled = false;
    }
});

branchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('branchId').value;
    const payload = Object.fromEntries(new FormData(branchForm).entries());
    document.getElementById('branchFormError').textContent = '';
    const saveButton = document.getElementById('saveBranchButton');
    saveButton.disabled = true;

    try {
        await request(id ? `/user/manager/branches/${id}` : '/user/manager/branches', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(payload),
        });
        branchModal.hide();
        showAlert(id ? 'Branch location updated.' : 'Branch location created.');
        loadBranches().catch((error) => showAlert(error.message, 'danger'));
    } catch (error) {
        document.getElementById('branchFormError').textContent = error.message;
    } finally {
        saveButton.disabled = false;
    }
});

stockItemForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('stockItemId').value;
    const payload = Object.fromEntries(new FormData(stockItemForm).entries());
    payload.unit_cost = Number(payload.unit_cost);
    document.getElementById('stockItemFormError').textContent = '';
    const saveButton = document.getElementById('saveStockItemButton');
    saveButton.disabled = true;

    try {
        await request(id ? `/user/manager/stock-items/${id}` : '/user/manager/stock-items', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(payload),
        });
        stockItemModal.hide();
        showAlert(id ? 'General stock item updated.' : 'General stock item created.');
        loadStockItems().catch((error) => showAlert(error.message, 'danger'));
    } catch (error) {
        document.getElementById('stockItemFormError').textContent = error.message;
    } finally {
        saveButton.disabled = false;
    }
});

Promise.all([
    loadUsers().catch((error) => {
        setEmptyRow(usersTableBody, 5, 'Could not load staff accounts.');
        throw error;
    }),
    loadBranches().catch((error) => {
        setEmptyRow(branchesTableBody, 4, 'Could not load branch locations.');
        throw error;
    }),
    loadStockItems().catch((error) => {
        setEmptyRow(stockItemsTableBody, 5, 'Could not load general stock items.');
        throw error;
    }),
]).catch((error) => {
    showAlert(error.message, 'danger');
});