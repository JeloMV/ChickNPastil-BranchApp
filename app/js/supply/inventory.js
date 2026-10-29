document.addEventListener('DOMContentLoaded', () => {
    const pageSize = 6;
    const logPageSize = 3;
    const receivedLogPageSize = 6;
    const state = {
        page: 1,
        logPage: 1,
        receivedLogPage: 1,
        search: '',
        inventorySort: 'name',
        logSearch: '',
        logSort: 'desc',
        items: [],
    };
    const errorMessage = document.getElementById('inventoryError');
    const inventoryRows = document.getElementById('inventoryRows');
    const inventoryLogRows = document.getElementById('inventoryLogRows');
    const receivedLogRows = document.getElementById('receivedLogRows');
    const addItemModal = document.getElementById('addItemModal');
    const settingsModal = document.getElementById('editBranchSpecsModal');
    const updateStockModal = document.getElementById('updateStockModal');
    const receivedLogDetailsModal = bootstrap.Modal.getOrCreateInstance(
        document.getElementById('receivedLogDetailsModal'),
    );

    const formatQuantity = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const formatDate = (value) => new Date(`${value.replace(' ', 'T')}Z`).toLocaleString();

    const showError = (message) => {
        errorMessage.textContent = message;
        errorMessage.classList.remove('d-none');
    };

    const clearError = () => {
        errorMessage.textContent = '';
        errorMessage.classList.add('d-none');
        document.querySelectorAll('[data-modal-error]').forEach((message) => {
            message.textContent = '';
        });
    };

    const request = async (url, options = {}) => {
        const response = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'The request could not be completed.');
        return result;
    };

    const appendCell = (row, value, className = '') => {
        const cell = document.createElement('td');
        cell.textContent = value;
        if (className) cell.className = className;
        row.appendChild(cell);
        return cell;
    };

    const addPaginationButton = (pagination, label, page, disabled, active = false) => {
        const item = document.createElement('li');
        item.className = `page-item${disabled ? ' disabled' : ''}${active ? ' active' : ''}`;
        if (active) item.setAttribute('aria-current', 'page');

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'page-link';
        button.textContent = label;
        button.dataset.page = page;
        button.disabled = disabled;
        item.appendChild(button);
        pagination.appendChild(item);
    };

    const renderPagination = (elementId, currentPage, pageCount) => {
        const pagination = document.getElementById(elementId);
        pagination.replaceChildren();
        const lastPage = Math.max(pageCount, 1);
        addPaginationButton(pagination, 'Previous', Math.max(currentPage - 1, 1), currentPage <= 1);

        for (let page = 1; page <= lastPage; page += 1) {
            addPaginationButton(pagination, String(page), page, false, page === currentPage);
        }

        addPaginationButton(pagination, 'Next', Math.min(currentPage + 1, lastPage), currentPage >= lastPage);
    };

    const renderInventory = (data) => {
        state.items = data.items;
        inventoryRows.replaceChildren();

        if (data.items.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 6;
            cell.className = 'text-center text-secondary py-4';
            cell.textContent = data.total === 0 && !state.search
                ? 'No items in this branch inventory yet.'
                : 'No inventory items match your search.';
            row.appendChild(cell);
            inventoryRows.appendChild(row);
        }

        data.items.forEach((item) => {
            const row = document.createElement('tr');
            const nameCell = document.createElement('th');
            nameCell.scope = 'row';
            nameCell.className = 'ps-3 fw-medium';
            nameCell.append(document.createTextNode(item.name));
            const unit = document.createElement('small');
            unit.className = 'd-block text-secondary fw-normal';
            unit.textContent = item.unit_type;
            nameCell.appendChild(unit);
            row.appendChild(nameCell);

            const stockCell = document.createElement('td');
            const quantity = document.createElement('span');
            quantity.className = 'fw-semibold';
            quantity.textContent = `${formatQuantity(item.quantity)} ${item.unit_type}`;
            stockCell.appendChild(quantity);
            if (Number(item.quantity) <= Number(item.low_quantity_threshold)) {
                const badge = document.createElement('span');
                badge.className = 'badge bg-warning-subtle text-warning-emphasis ms-1';
                badge.textContent = 'Low';
                stockCell.appendChild(badge);
            }
            row.appendChild(stockCell);
            appendCell(row, `${formatQuantity(item.low_quantity_threshold)} ${item.unit_type}`);
            appendCell(row, `${formatQuantity(item.restock_target_quantity)} ${item.unit_type}`);
            appendCell(row, `PHP ${Number(item.unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

            const actions = document.createElement('td');
            actions.className = 'text-end pe-3 text-nowrap';
            actions.innerHTML = `
                <button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal"
                    data-bs-target="#editBranchSpecsModal" data-action="settings" data-id="${item.id}">
                    <i class="bi bi-sliders me-1" aria-hidden="true"></i>Edit branch settings
                </button>
                <button class="btn btn-sm btn-outline-success" type="button" data-bs-toggle="modal"
                    data-bs-target="#updateStockModal" data-action="stock" data-id="${item.id}">
                    <i class="bi bi-arrow-repeat me-1" aria-hidden="true"></i>Update stock
                </button>`;
            row.appendChild(actions);
            inventoryRows.appendChild(row);
        });

        const start = data.total === 0 ? 0 : ((data.page - 1) * pageSize) + 1;
        const end = Math.min(data.page * pageSize, data.total);
        document.getElementById('inventorySummary').textContent = `Showing ${start}–${end} of ${data.total} items`;
        document.getElementById('inventoryCount').textContent =
            `${data.total} ${data.total === 1 ? 'item' : 'items'}`;
        renderPagination('inventoryPagination', data.page, data.pageCount);

        const catalog = document.getElementById('newInventoryCatalogItem');
        const selectedValue = catalog.value;
        catalog.replaceChildren(new Option('Select a catalog item', ''));
        catalog.disabled = data.availableItems.length === 0;
        data.availableItems.forEach((item) => {
            catalog.add(new Option(`${item.name} · ${item.unit_type}`, item.id));
        });
        if (data.availableItems.some((item) => String(item.id) === selectedValue)) {
            catalog.value = selectedValue;
        }
    };

    const renderLogs = (data) => {
        inventoryLogRows.replaceChildren();
        if (data.logs.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 5;
            cell.className = 'text-center text-secondary py-4';
            cell.textContent = state.logSearch
                ? 'No quantity updates match these filters.'
                : 'No quantity updates recorded yet.';
            row.appendChild(cell);
            inventoryLogRows.appendChild(row);
        }

        data.logs.forEach((log) => {
            const row = document.createElement('tr');
            appendCell(row, formatDate(log.date_and_time), 'ps-3 text-nowrap');
            const nameCell = document.createElement('th');
            nameCell.scope = 'row';
            nameCell.className = 'fw-medium';
            nameCell.textContent = log.name;
            row.appendChild(nameCell);
            appendCell(row, log.user_name || 'Unknown user');
            const difference = Number(log.value_after) - Number(log.value_before);
            appendCell(
                row,
                `${difference > 0 ? '+' : ''}${formatQuantity(difference)} ${log.unit_type}`,
                `${difference >= 0 ? 'text-success' : 'text-danger'} fw-semibold`
            );
            appendCell(row, log.reason || '—');
            inventoryLogRows.appendChild(row);
        });

        const start = data.logTotal === 0 ? 0 : ((data.logPage - 1) * logPageSize) + 1;
        const end = Math.min(data.logPage * logPageSize, data.logTotal);
        document.getElementById('inventoryLogSummary').textContent = `Showing ${start}–${end} of ${data.logTotal} updates`;
        document.getElementById('inventoryLogCount').textContent =
            `${data.logTotal} ${data.logTotal === 1 ? 'update' : 'updates'}`;
        renderPagination('inventoryLogPagination', data.logPage, data.logPageCount);
    };

    const renderReceivedLogs = (data) => {
        receivedLogRows.replaceChildren();
        if (data.receipts.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 6;
            cell.className = 'text-center text-secondary py-4';
            cell.textContent = 'No received stock records yet.';
            row.appendChild(cell);
            receivedLogRows.appendChild(row);
        }

        data.receipts.forEach((receipt) => {
            const row = document.createElement('tr');
            appendCell(row, formatDate(receipt.date_and_time), 'ps-3 text-nowrap');
            appendCell(row, `Request #${receipt.request_id}`);
            appendCell(row, receipt.requestedBy || 'Unknown user');
            appendCell(row, receipt.receivedBy || 'Unknown user');
            appendCell(row, String(receipt.item_count));

            const actions = document.createElement('td');
            actions.className = 'text-end pe-3';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-sm btn-outline-primary';
            button.dataset.viewReceipt = receipt.id;
            button.innerHTML = '<i class="bi bi-eye me-1" aria-hidden="true"></i>View items';
            actions.appendChild(button);
            row.appendChild(actions);
            receivedLogRows.appendChild(row);
        });

        const start = data.total === 0 ? 0 : ((data.page - 1) * receivedLogPageSize) + 1;
        const end = Math.min(data.page * receivedLogPageSize, data.total);
        document.getElementById('receivedLogSummary').textContent =
            `Showing ${start}–${end} of ${data.total} receipts`;
        document.getElementById('receivedLogCount').textContent =
            `${data.total} ${data.total === 1 ? 'receipt' : 'receipts'}`;
        renderPagination('receivedLogPagination', data.page, data.pageCount);
    };

    const loadReceivedLogs = async () => {
        try {
            const data = await request(`/supply/inventory/received-log?page=${state.receivedLogPage}`);
            renderReceivedLogs(data);
        } catch (error) {
            showError(error.message);
            document.getElementById('receivedLogCount').textContent = 'Received log unavailable';
            document.getElementById('receivedLogSummary').textContent = 'Unable to load received stock log';
            receivedLogRows.replaceChildren();
        }
    };

    const showReceivedLogDetails = async (receiptId) => {
        try {
            const data = await request(`/supply/inventory/received-log/${receiptId}`);
            const { receipt } = data;
            document.getElementById('receivedLogDetailsSubtitle').textContent =
                `Request #${receipt.request_id} · Receipt #${receipt.id}`;
            document.getElementById('receivedLogRequestedBy').textContent = receipt.requestedBy || 'Unknown user';
            document.getElementById('receivedLogRequestedAt').textContent = formatDate(receipt.requested_at);
            document.getElementById('receivedLogReceivedBy').textContent = receipt.receivedBy || 'Unknown user';
            document.getElementById('receivedLogReceivedAt').textContent = formatDate(receipt.received_at);
            document.getElementById('receivedLogRequestNote').textContent = receipt.request_note || 'No request note.';
            document.getElementById('receivedLogPreparationNote').textContent =
                receipt.preparation_note || 'No preparation note.';
            document.getElementById('receivedLogTransitNote').textContent =
                receipt.transit_note || 'No transit note.';
            document.getElementById('receivedLogNote').textContent =
                receipt.receiving_note || 'No receiving notes or discrepancies recorded.';

            const itemsBody = document.getElementById('receivedLogDetailsItems');
            itemsBody.replaceChildren();
            if (data.items.length === 0) {
                const row = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = 5;
                cell.className = 'text-center text-secondary py-3';
                cell.textContent = 'No items found for this receipt.';
                row.appendChild(cell);
                itemsBody.appendChild(row);
            }
            data.items.forEach((item) => {
                const row = document.createElement('tr');
                const name = document.createElement('th');
                name.scope = 'row';
                name.textContent = item.name;
                row.appendChild(name);
                appendCell(row, item.unit_type);
                appendCell(row, formatQuantity(item.requested_quantity), 'text-end');
                appendCell(row, formatQuantity(item.received_quantity), 'text-end text-success fw-semibold');
                appendCell(row, formatQuantity(item.lost_quantity), 'text-end text-danger fw-semibold');
                itemsBody.appendChild(row);
            });
            receivedLogDetailsModal.show();
        } catch (error) {
            showError(error.message);
        }
    };

    const loadInventory = async () => {
        clearError();
        const params = new URLSearchParams({
            page: state.page,
            logPage: state.logPage,
            search: state.search,
            inventorySort: state.inventorySort,
            logSearch: state.logSearch,
            logSort: state.logSort,
        });
        try {
            const data = await request(`/supply/inventory/data?${params}`);
            renderInventory(data);
            renderLogs(data);
        } catch (error) {
            showError(error.message);
            document.getElementById('inventoryCount').textContent = 'Inventory unavailable';
            document.getElementById('inventorySummary').textContent = 'Unable to load inventory';
            document.getElementById('inventoryLogCount').textContent = 'Update log unavailable';
            document.getElementById('inventoryLogSummary').textContent = 'Unable to load update log';
        }
    };

    const saveForm = async (url, body, modal, method = 'POST') => {
        clearError();
        try {
            await request(url, { method, body: JSON.stringify(body) });
            modal.querySelector('form').reset();
            bootstrap.Modal.getOrCreateInstance(modal).hide();
            await loadInventory();
        } catch (error) {
            showError(error.message);
            modal.querySelector('[data-modal-error]').textContent = error.message;
        }
    };

    addItemModal.addEventListener('show.bs.modal', () => clearError());
    settingsModal.addEventListener('show.bs.modal', (event) => {
        clearError();
        const item = state.items.find((entry) => String(entry.id) === event.relatedTarget.dataset.id);
        if (!item) return;

        settingsModal.dataset.itemId = item.id;
        document.getElementById('editBranchSpecsModalTitle').nextElementSibling.textContent = `${item.name} · ${item.unit_type}`;
        document.getElementById('branchLowThreshold').value = item.low_quantity_threshold;
        document.getElementById('branchRestockTarget').value = item.restock_target_quantity;
    });

    updateStockModal.addEventListener('show.bs.modal', (event) => {
        clearError();
        const item = state.items.find((entry) => String(entry.id) === event.relatedTarget.dataset.id);
        if (!item) return;

        updateStockModal.dataset.itemId = item.id;
        document.getElementById('updateStockModalTitle').nextElementSibling.textContent = `${item.name} · ${item.unit_type}`;
        document.getElementById('currentStock').value = `${formatQuantity(item.quantity)} ${item.unit_type}`;
        document.getElementById('updatedStock').value = item.quantity;
    });

    document.getElementById('addInventoryForm').addEventListener('submit', (event) => {
        event.preventDefault();
        saveForm('/supply/inventory/items', {
            generalStockItemId: document.getElementById('newInventoryCatalogItem').value,
            quantity: document.getElementById('newItemStock').value,
            lowQuantityThreshold: document.getElementById('newItemThreshold').value,
            restockTargetQuantity: document.getElementById('newItemTarget').value,
        }, addItemModal);
    });

    document.getElementById('branchSettingsForm').addEventListener('submit', (event) => {
        event.preventDefault();
        saveForm(`/supply/inventory/items/${settingsModal.dataset.itemId}/settings`, {
            lowQuantityThreshold: document.getElementById('branchLowThreshold').value,
            restockTargetQuantity: document.getElementById('branchRestockTarget').value,
        }, settingsModal, 'PUT');
    });

    document.getElementById('updateStockForm').addEventListener('submit', (event) => {
        event.preventDefault();
        saveForm(`/supply/inventory/items/${updateStockModal.dataset.itemId}/stock`, {
            quantity: document.getElementById('updatedStock').value,
            reason: document.getElementById('stockUpdateReason').value,
        }, updateStockModal, 'PUT');
    });

    document.getElementById('inventoryPagination').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-page]');
        if (!button || button.disabled) return;
        state.page = Number(button.dataset.page);
        loadInventory();
    });

    document.getElementById('inventoryLogPagination').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-page]');
        if (!button || button.disabled) return;
        state.logPage = Number(button.dataset.page);
        loadInventory();
    });

    document.getElementById('receivedLogPagination').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-page]');
        if (!button || button.disabled) return;
        state.receivedLogPage = Number(button.dataset.page);
        loadReceivedLogs();
    });

    receivedLogRows.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-view-receipt]');
        if (!button) return;
        showReceivedLogDetails(button.dataset.viewReceipt);
    });

    let searchTimeout;
    document.getElementById('inventorySearch').addEventListener('input', (event) => {
        const search = event.currentTarget.value.trim();
        window.clearTimeout(searchTimeout);
        searchTimeout = window.setTimeout(() => {
            state.search = search;
            state.page = 1;
            loadInventory();
        }, 250);
    });

    document.getElementById('inventorySort').addEventListener('change', (event) => {
        state.inventorySort = event.currentTarget.value;
        state.page = 1;
        loadInventory();
    });

    let logSearchTimeout;
    document.getElementById('inventoryLogSearch').addEventListener('input', (event) => {
        const search = event.currentTarget.value.trim();
        window.clearTimeout(logSearchTimeout);
        logSearchTimeout = window.setTimeout(() => {
            state.logSearch = search;
            state.logPage = 1;
            loadInventory();
        }, 250);
    });

    document.getElementById('inventoryLogSort').addEventListener('change', (event) => {
        state.logSort = event.currentTarget.value;
        state.logPage = 1;
        loadInventory();
    });

    loadInventory();
    loadReceivedLogs();
});