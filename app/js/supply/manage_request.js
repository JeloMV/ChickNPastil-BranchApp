document.addEventListener('DOMContentLoaded', () => {
    const pageSize = 10;
    const state = { requests: [], consolidatedItems: [], activeRequestId: null, page: 1 };
    const tableBody = document.getElementById('requestsTableBody');
    const consolidatedBody = document.getElementById('consolidatedItemsTableBody');
    const pagination = document.getElementById('requestsPagination');
    const message = document.getElementById('requestMessage');
    const statusActionModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('statusActionModal'));
    const requestItemsModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('requestItemsModal'));
    const receiptDetailsModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('receiptDetailsModal'));

    const formatQuantity = (quantity) =>
        Number(quantity).toLocaleString(undefined, { maximumFractionDigits: 2 });

    const formatDate = (dateTime) => new Date(dateTime.replace(' ', 'T')).toLocaleString();

    const normalizeStatus = (status) => status.toLowerCase().replace(/\s+/g, '_');
    const getStatusLabel = (status) => statusLabels[normalizeStatus(status)] || status;

    const statusLabels = {
        pending: 'Pending',
        preparing: 'Preparing',
        in_transit: 'In transit',
        rejected: 'Rejected',
        received: 'Received',
        cancelled: 'Cancelled',
    };

    const showMessage = (text, type = 'danger') => {
        message.textContent = text;
        message.className = `alert alert-${type}`;
    };

    const sendRequest = async (url, options = {}) => {
        const response = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'The request could not be completed.');
        return result;
    };

    const appendCell = (row, text, className = '') => {
        const cell = document.createElement('td');
        cell.textContent = text;
        if (className) cell.className = className;
        row.appendChild(cell);
        return cell;
    };

    const showEmptyRow = (container, columnCount, text) => {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = columnCount;
        cell.className = 'text-center text-secondary py-4';
        cell.textContent = text;
        row.appendChild(cell);
        container.appendChild(row);
    };

    const getFilteredRequests = () => {
        const search = document.getElementById('requestSearch').value.trim().toLowerCase();
        const status = document.getElementById('statusFilter').value;
        const branch = document.getElementById('branchFilter').value;
        const sort = document.getElementById('requestSort').value;

        const requests = state.requests.filter((request) => {
            const matchesSearch = [
                String(request.id),
                request.branchName,
                request.requesterName,
                ...request.items.map((item) => item.name),
            ].some((value) => value.toLowerCase().includes(search));
            return matchesSearch &&
                (!status || normalizeStatus(request.status) === status) &&
                (!branch || request.branchName === branch);
        });

        requests.sort((left, right) => {
            if (sort === 'oldest') return new Date(left.dateAndTime) - new Date(right.dateAndTime);
            if (sort === 'branch') return left.branchName.localeCompare(right.branchName);
            if (sort === 'status') return getStatusLabel(left.status).localeCompare(getStatusLabel(right.status));
            return new Date(right.dateAndTime) - new Date(left.dateAndTime);
        });
        return requests;
    };

    const createActionButton = (label, icon, className, action, request) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn btn-sm ${className}`;
        button.dataset.action = action;
        button.dataset.requestId = request.id;
        button.setAttribute('aria-label', label);
        const iconElement = document.createElement('i');
        iconElement.className = `bi ${icon} me-1`;
        iconElement.setAttribute('aria-hidden', 'true');
        button.append(iconElement, document.createTextNode(label));
        return button;
    };

    const renderRequests = () => {
        const requests = getFilteredRequests();
        const pageCount = Math.ceil(requests.length / pageSize);
        state.page = Math.min(state.page, Math.max(pageCount, 1));
        const start = requests.length === 0 ? 0 : ((state.page - 1) * pageSize) + 1;
        const end = Math.min(state.page * pageSize, requests.length);
        document.getElementById('showingRequests').textContent =
            `Showing ${start}–${end} of ${requests.length} ${requests.length === 1 ? 'request' : 'requests'}`;

        pagination.replaceChildren();
        const lastPage = Math.max(pageCount, 1);
        const addPageButton = (label, page, disabled, active = false) => {
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
        addPageButton('Previous', Math.max(state.page - 1, 1), state.page <= 1);
        for (let page = 1; page <= lastPage; page += 1) {
            addPageButton(String(page), page, false, page === state.page);
        }
        addPageButton('Next', Math.min(state.page + 1, lastPage), state.page >= lastPage);

        const pageRequests = requests.slice((state.page - 1) * pageSize, state.page * pageSize);
        tableBody.replaceChildren();
        const statusCounts = state.requests.reduce((counts, request) => {
            const status = normalizeStatus(request.status);
            counts[status] = (counts[status] || 0) + 1;
            return counts;
        }, {});
        Object.entries({
            pending: 'pendingRequestCount',
            preparing: 'preparingRequestCount',
            in_transit: 'inTransitRequestCount',
            rejected: 'rejectedRequestCount',
            received: 'receivedRequestCount',
        }).forEach(([status, elementId]) => {
            document.getElementById(elementId).textContent = statusCounts[status] || 0;
        });
        document.getElementById('requestCount').textContent =
            `${state.requests.length} ${state.requests.length === 1 ? 'request' : 'requests'}`;

        if (requests.length === 0) {
            showEmptyRow(tableBody, 7, state.requests.length ? 'No requests match these filters.' : 'There are no branch requests yet.');
            return;
        }

        pageRequests.forEach((request) => {
            const row = document.createElement('tr');
            const idCell = document.createElement('th');
            idCell.scope = 'row';
            idCell.className = 'ps-3';
            idCell.textContent = request.id;
            row.appendChild(idCell);
            appendCell(row, request.branchName);
            appendCell(row, request.requesterName || '—');
            appendCell(row, formatDate(request.dateAndTime), 'text-nowrap');
            const totalQuantity = request.items.reduce((total, item) => total + Number(item.quantity), 0);
            appendCell(
                row,
                `${request.items.length} ${request.items.length === 1 ? 'item' : 'items'} · ${formatQuantity(totalQuantity)} units`,
            );

            const status = normalizeStatus(request.status);
            const badgeStyles = {
                pending: 'bg-secondary-subtle text-secondary-emphasis',
                preparing: 'bg-warning-subtle text-warning-emphasis',
                in_transit: 'bg-info-subtle text-info-emphasis',
                rejected: 'bg-danger-subtle text-danger-emphasis',
                received: 'bg-success-subtle text-success-emphasis',
                cancelled: 'bg-secondary-subtle text-secondary-emphasis',
            };
            const statusCell = appendCell(row, '');
            const badge = document.createElement('span');
            badge.className = `badge ${badgeStyles[status] || 'bg-secondary-subtle text-secondary-emphasis'}`;
            badge.textContent = getStatusLabel(request.status);
            statusCell.appendChild(badge);

            const actions = appendCell(row, '', 'text-end pe-3 text-nowrap');
            actions.appendChild(createActionButton('Items', 'bi-list-ul', 'btn-outline-primary me-1', 'items', request));
            actions.appendChild(createActionButton('Print manifest', 'bi-printer', 'btn-outline-secondary me-1', 'manifest', request));
            if (status === 'received') {
                actions.appendChild(createActionButton('Receipt details', 'bi-clipboard-check', 'btn-outline-info', 'receipt', request));
            } else if (status !== 'cancelled') {
                actions.appendChild(createActionButton('Change status', 'bi-arrow-left-right', 'btn-outline-success', 'status', request));
            }
            tableBody.appendChild(row);
        });
    };

    pagination.addEventListener('click', (event) => {
        const button = event.target.closest('[data-page]');
        if (!button || button.disabled) return;
        state.page = Number(button.dataset.page);
        renderRequests();
    });

    const renderConsolidatedItems = () => {
        consolidatedBody.replaceChildren();
        if (state.consolidatedItems.length === 0) {
            showEmptyRow(consolidatedBody, 4, 'No items are currently being prepared.');
            return;
        }

        state.consolidatedItems.forEach((item) => {
            const row = document.createElement('tr');
            const name = document.createElement('th');
            name.scope = 'row';
            name.textContent = item.name;
            row.appendChild(name);
            appendCell(row, item.unitType);
            appendCell(row, `${formatQuantity(item.quantity)} ${item.unitType}`, 'text-end');
            appendCell(row, item.requestCount);
            consolidatedBody.appendChild(row);
        });
    };

    const populateBranchFilter = () => {
        const select = document.getElementById('branchFilter');
        const selectedBranch = select.value;
        const branches = Array.from(new Set(state.requests.map((request) => request.branchName)))
            .sort((left, right) => left.localeCompare(right));
        select.replaceChildren(new Option('All branches', ''));
        branches.forEach((branch) => select.add(new Option(branch, branch)));
        select.value = branches.includes(selectedBranch) ? selectedBranch : '';
    };

    const loadRequests = async () => {
        const data = await sendRequest('/supply/manage_request/data');
        state.requests = data.requests;
        state.consolidatedItems = data.consolidatedItems;
        populateBranchFilter();
        renderRequests();
        renderConsolidatedItems();
    };

    const showRequestItems = (request) => {
        state.activeRequestId = request.id;
        document.getElementById('requestItemsModalTitle').textContent = `Request ${request.id}`;
        document.getElementById('requestItemsSubtitle').textContent =
            `${request.branchName} · ${getStatusLabel(request.status)}`;
        document.getElementById('requestItemsRequester').textContent = request.requesterName || '—';
        document.getElementById('requestItemsDate').textContent = formatDate(request.dateAndTime);

        const requestNoteWrap = document.getElementById('requestNoteWrap');
        requestNoteWrap.classList.toggle('d-none', !request.note);
        document.getElementById('requestItemsNote').textContent = request.note || '';

        const statusNotes = [
            ['Rejection note', request.rejectionNote],
            ['Preparation note', request.preparationNote],
            ['Transit note', request.transitNote],
        ].filter(([, note]) => note);
        const statusNoteWrap = document.getElementById('requestStatusNoteWrap');
        statusNoteWrap.classList.toggle('d-none', statusNotes.length === 0);
        document.getElementById('requestStatusNoteLabel').textContent = statusNotes.map(([label]) => label).join(' · ');
        document.getElementById('requestStatusNote').textContent = statusNotes.map(([, note]) => note).join(' · ');

        const itemsBody = document.getElementById('requestItemsTableBody');
        itemsBody.replaceChildren();
        if (request.items.length === 0) {
            showEmptyRow(itemsBody, 3, 'This request has no items.');
        } else {
            request.items.forEach((item) => {
                const row = document.createElement('tr');
                const name = document.createElement('th');
                name.scope = 'row';
                name.textContent = item.name;
                row.appendChild(name);
                appendCell(row, item.unitType);
                appendCell(row, formatQuantity(item.quantity), 'text-end');
                itemsBody.appendChild(row);
            });
        }
        document.getElementById('markPreparingFromItems').classList.toggle(
            'd-none',
            normalizeStatus(request.status) !== 'pending',
        );
        requestItemsModal.show();
    };

    const showReceiptDetails = (request) => {
        const receipt = request.receipt;
        document.getElementById('receiptDetailsSubtitle').textContent =
            `Request ${request.id} · ${request.branchName}`;
        document.getElementById('receiptDetailsId').textContent = receipt ? receipt.id : 'No receipt log found';
        document.getElementById('receiptDetailsReceivedAt').textContent =
            receipt ? formatDate(receipt.dateAndTime) : '—';
        document.getElementById('receiptDetailsReceivedBy').textContent =
            receipt && receipt.receivedBy ? receipt.receivedBy : '—';
        document.getElementById('receiptDetailsNote').textContent =
            receipt && receipt.note ? receipt.note : 'No receiving notes or discrepancies recorded.';

        const itemsBody = document.getElementById('receiptDetailsItems');
        itemsBody.replaceChildren();
        if (!receipt) {
            showEmptyRow(itemsBody, 5, 'There is no receiving log for this request.');
        } else {
            request.items.forEach((item) => {
                const row = document.createElement('tr');
                const name = document.createElement('th');
                name.scope = 'row';
                name.textContent = item.name;
                row.appendChild(name);
                appendCell(row, item.unitType);
                appendCell(row, formatQuantity(item.quantity), 'text-end');
                appendCell(row, formatQuantity(item.receivedQuantity), 'text-end');
                appendCell(row, formatQuantity(item.lostQuantity), 'text-end');
                itemsBody.appendChild(row);
            });
        }
        receiptDetailsModal.show();
    };

    const openStatusAction = (request, selectedStatus) => {
        state.activeRequestId = request.id;
        document.getElementById('statusActionTitle').textContent = 'Change request status';
        document.getElementById('statusActionSubtitle').textContent =
            `Request ${request.id} · ${request.branchName}`;
        const statusSelect = document.getElementById('statusActionStatus');
        statusSelect.value = selectedStatus || normalizeStatus(request.status);
        loadStatusNote(request);
        updateStatusActionButton();
        statusActionModal.show();
    };

    const loadStatusNote = (request) => {
        const status = document.getElementById('statusActionStatus').value;
        const noteFields = {
            preparing: request.preparationNote,
            in_transit: request.transitNote,
            rejected: request.rejectionNote,
        };
        const noteInput = document.getElementById('statusActionNote');
        noteInput.disabled = status === 'pending';
        noteInput.value = status === 'pending' ? '' : noteFields[status] || '';
    };

    const updateStatusActionButton = () => {
        const status = document.getElementById('statusActionStatus').value;
        const confirmButton = document.getElementById('confirmStatusAction');
        confirmButton.textContent = `Set to ${getStatusLabel(status).toLowerCase()}`;
        confirmButton.className = `btn ${status === 'rejected' ? 'btn-danger' : 'btn-primary'}`;
    };

    window.initializeRequestPrinting(state, { formatQuantity, formatDate, getStatusLabel, normalizeStatus });

    tableBody.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const request = state.requests.find((item) => item.id === Number(button.dataset.requestId));
        if (!request) return;
        if (button.dataset.action === 'items') {
            showRequestItems(request);
        } else if (button.dataset.action === 'receipt') {
            showReceiptDetails(request);
        } else if (button.dataset.action === 'status') {
            openStatusAction(request, null);
        } else if (button.dataset.action !== 'manifest') {
            return;
        }
    });

    document.getElementById('markPreparingFromItems').addEventListener('click', () => {
        const request = state.requests.find((item) => item.id === state.activeRequestId);
        if (!request) return;
        document.getElementById('requestItemsModal').addEventListener('hidden.bs.modal', () => {
            openStatusAction(request, 'preparing');
        }, { once: true });
        requestItemsModal.hide();
    });

    document.getElementById('statusActionStatus').addEventListener('change', () => {
        const request = state.requests.find((item) => item.id === state.activeRequestId);
        if (request) loadStatusNote(request);
        updateStatusActionButton();
    });

    document.getElementById('confirmStatusAction').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        message.classList.add('d-none');
        try {
            await sendRequest(`/supply/manage_request/${state.activeRequestId}/status`, {
                method: 'PUT',
                body: JSON.stringify({
                    status: document.getElementById('statusActionStatus').value,
                    note: document.getElementById('statusActionNote').value,
                }),
            });
            statusActionModal.hide();
            await loadRequests();
            showMessage('Request status updated.', 'success');
        } catch (error) {
            showMessage(error.message);
        } finally {
            button.disabled = false;
        }
    });

    ['requestSearch', 'statusFilter', 'branchFilter', 'requestSort'].forEach((id) => {
        const updateRequests = () => {
            state.page = 1;
            renderRequests();
        };
        document.getElementById(id).addEventListener('input', updateRequests);
        document.getElementById(id).addEventListener('change', updateRequests);
    });

    loadRequests().catch((error) => {
        showMessage(error.message);
        tableBody.replaceChildren();
        showEmptyRow(tableBody, 7, 'Unable to load requests.');
        consolidatedBody.replaceChildren();
        showEmptyRow(consolidatedBody, 4, 'Unable to load consolidated items.');
        document.getElementById('requestCount').textContent = 'Requests unavailable';
        document.getElementById('showingRequests').textContent = 'Unable to load requests';
        pagination.replaceChildren();
    });
});
