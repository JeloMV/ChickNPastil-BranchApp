document.addEventListener('DOMContentLoaded', () => {
    const pageSize = 10;
    const state = { requests: [], activeRequestId: null, staffName: '', page: 1, deliveryPage: 1 };
    const tableBody = document.getElementById('requestsTableBody');
    const deliveryTableBody = document.getElementById('deliveryRequestsTableBody');
    const pagination = document.getElementById('requestsPagination');
    const deliveryPagination = document.getElementById('deliveryRequestsPagination');
    const message = document.getElementById('requestMessage');
    const viewModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('viewRequestModal'));
    const historyModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('requestHistoryModal'));
    const cancelModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('cancelRequestModal'));
    const receiveModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('receiveDeliveryModal'));

    const statusLabels = {
        pending: 'Pending',
        preparing: 'Preparing',
        in_transit: 'In transit',
        received: 'Received',
        rejected: 'Rejected',
        cancelled: 'Cancelled',
    };

    const formatQuantity = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const formatDate = (value) => new Date(value.replace(' ', 'T')).toLocaleString();
    const getStatusLabel = (status) => statusLabels[status] || status;

    const sendRequest = async (url, options = {}) => {
        const response = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'The request could not be completed.');
        return result;
    };

    const showMessage = (text, type = 'success') => {
        message.textContent = text;
        message.className = `alert alert-${type}`;
    };

    const appendCell = (row, text, className = '') => {
        const cell = document.createElement('td');
        cell.textContent = text;
        if (className) cell.className = className;
        row.appendChild(cell);
        return cell;
    };

    const showEmptyRow = (text, body = tableBody) => {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.className = 'text-center text-secondary py-4';
        cell.textContent = text;
        row.appendChild(cell);
        body.appendChild(row);
    };

    const createActionButton = (label, action, className, icon) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn btn-sm ${className}`;
        button.dataset.action = action;
        const iconElement = document.createElement('i');
        iconElement.className = `bi ${icon} me-1`;
        iconElement.setAttribute('aria-hidden', 'true');
        button.append(iconElement, document.createTextNode(label));
        return button;
    };

    const renderRequestRows = (requests, body, emptyMessage) => {
        body.replaceChildren();
        if (requests.length === 0) {
            showEmptyRow(emptyMessage, body);
            return;
        }
        requests.forEach((request) => {
            const row = document.createElement('tr');
            row.dataset.requestId = request.id;
            const idCell = document.createElement('th');
            idCell.scope = 'row';
            idCell.className = 'ps-3';
            idCell.textContent = request.id;
            row.appendChild(idCell);
            appendCell(row, request.requesterName || 'Unknown requester');
            appendCell(row, formatDate(request.dateAndTime), 'text-nowrap');
            const totalQuantity = request.items.reduce((total, item) => total + Number(item.quantity), 0);
            appendCell(row, `${request.items.length} ${request.items.length === 1 ? 'item' : 'items'} · ${formatQuantity(totalQuantity)} units`);

            const statusCell = appendCell(row, '');
            const badgeClasses = {
                pending: 'bg-secondary-subtle text-secondary-emphasis',
                preparing: 'bg-warning-subtle text-warning-emphasis',
                in_transit: 'bg-info-subtle text-info-emphasis',
                received: 'bg-success-subtle text-success-emphasis',
                rejected: 'bg-danger-subtle text-danger-emphasis',
                cancelled: 'bg-secondary-subtle text-secondary-emphasis',
            };
            const badge = document.createElement('span');
            badge.className = `badge ${badgeClasses[request.status] || badgeClasses.pending}`;
            badge.textContent = getStatusLabel(request.status);
            statusCell.appendChild(badge);

            const actions = appendCell(row, '', 'text-end pe-3 text-nowrap');
            const viewButton = createActionButton('View', 'view', 'btn-outline-secondary me-1', 'bi-eye');
            viewButton.dataset.requestId = request.id;
            actions.appendChild(viewButton);
            const historyButton = createActionButton('History', 'history', 'btn-outline-secondary me-1', 'bi-clock-history');
            historyButton.dataset.requestId = request.id;
            actions.appendChild(historyButton);
            if (request.status === 'pending') {
                const cancelButton = createActionButton('Cancel', 'cancel', 'btn-outline-danger', 'bi-x-circle');
                cancelButton.dataset.requestId = request.id;
                actions.appendChild(cancelButton);
            }
            if (request.status === 'in_transit') {
                const receiveButton = createActionButton('Receive delivery', 'receive', 'btn-success', 'bi-box-arrow-in-down');
                receiveButton.dataset.requestId = request.id;
                actions.appendChild(receiveButton);
            }
            body.appendChild(row);
        });
    };

    const renderPagination = (list, pageKey, paginationElement, summaryElement) => {
        const pageCount = Math.ceil(list.length / pageSize);
        state[pageKey] = Math.min(state[pageKey], Math.max(pageCount, 1));
        const start = list.length === 0 ? 0 : ((state[pageKey] - 1) * pageSize) + 1;
        const end = Math.min(state[pageKey] * pageSize, list.length);
        summaryElement.textContent =
            `Showing ${start}–${end} of ${list.length} ${list.length === 1 ? 'request' : 'requests'}`;

        paginationElement.replaceChildren();
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
            button.dataset.pageKey = pageKey;
            button.disabled = disabled;
            item.appendChild(button);
            paginationElement.appendChild(item);
        };
        addPageButton('Previous', Math.max(state[pageKey] - 1, 1), state[pageKey] <= 1);
        for (let page = 1; page <= lastPage; page += 1) {
            addPageButton(String(page), page, false, page === state[pageKey]);
        }
        addPageButton('Next', Math.min(state[pageKey] + 1, lastPage), state[pageKey] >= lastPage);
        return list.slice((state[pageKey] - 1) * pageSize, state[pageKey] * pageSize);
    };

    const renderRequests = () => {
        const statusCounts = state.requests.reduce((counts, request) => {
            counts[request.status] = (counts[request.status] || 0) + 1;
            return counts;
        }, {});
        Object.entries({
            pending: 'pendingRequestCount',
            preparing: 'preparingRequestCount',
            in_transit: 'inTransitRequestCount',
            received: 'receivedRequestCount',
            rejected: 'rejectedRequestCount',
            cancelled: 'cancelledRequestCount',
        }).forEach(([status, elementId]) => {
            document.getElementById(elementId).textContent = statusCounts[status] || 0;
        });

        const deliveryRequests = state.requests.filter((request) =>
            request.status === 'preparing' ||
            request.status === 'in_transit' ||
            request.status === 'received'
        );
        const otherRequests = state.requests.filter((request) =>
            request.status !== 'preparing' &&
            request.status !== 'in_transit' &&
            request.status !== 'received'
        );
        document.getElementById('deliveryRequestCount').textContent =
            `${deliveryRequests.length} ${deliveryRequests.length === 1 ? 'request' : 'requests'}`;
        document.getElementById('requestCount').textContent =
            `${otherRequests.length} ${otherRequests.length === 1 ? 'request' : 'requests'}`;

        renderRequestRows(
            renderPagination(
                deliveryRequests,
                'deliveryPage',
                deliveryPagination,
                document.getElementById('showingDeliveryRequests'),
            ),
            deliveryTableBody,
            'No requests are currently preparing, in transit, or received.',
        );
        renderRequestRows(
            renderPagination(
                otherRequests,
                'page',
                pagination,
                document.getElementById('showingRequests'),
            ),
            tableBody,
            'You have not submitted any other stock requests.',
        );
    };

    const getActiveRequest = () => state.requests.find((request) => request.id === state.activeRequestId);

    const handlePaginationClick = (event) => {
        const button = event.target.closest('[data-page]');
        if (!button || button.disabled) return;
        state[button.dataset.pageKey] = Number(button.dataset.page);
        renderRequests();
    };
    pagination.addEventListener('click', handlePaginationClick);
    deliveryPagination.addEventListener('click', handlePaginationClick);

    const showRequestDetails = (request) => {
        document.getElementById('viewRequestSubtitle').textContent =
            `${request.id} · ${getStatusLabel(request.status)}`;
        document.getElementById('viewRequestRequester').textContent = request.requesterName || 'Unknown requester';
        document.getElementById('viewRequestDate').textContent = formatDate(request.dateAndTime);
        document.getElementById('viewRequestNote').textContent = request.note || 'No note provided.';
        const rows = document.getElementById('viewRequestItems');
        rows.replaceChildren();
        request.items.forEach((item) => {
            const row = document.createElement('tr');
            const name = document.createElement('th');
            name.scope = 'row';
            name.textContent = item.name;
            row.append(name);
            appendCell(row, item.unitType);
            appendCell(row, formatQuantity(item.quantity), 'text-end');
            rows.appendChild(row);
        });
        viewModal.show();
    };

    const showRequestHistory = (request) => {
        document.getElementById('requestHistorySubtitle').textContent = request.id;
        const timeline = document.getElementById('requestHistoryTimeline');
        timeline.replaceChildren();
        if (!request.statusHistory || request.statusHistory.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'text-center rounded-3 border bg-light py-5 px-3';
            const icon = document.createElement('i');
            icon.className = 'bi bi-clock-history fs-2 text-secondary';
            icon.setAttribute('aria-hidden', 'true');
            const message = document.createElement('p');
            message.className = 'text-secondary mb-0 mt-2';
            message.textContent = 'No status history is available yet.';
            emptyState.append(icon, message);
            timeline.appendChild(emptyState);
        } else {
            const statusStyles = {
                pending: { color: 'text-warning-emphasis', background: 'bg-warning-subtle', icon: 'bi-hourglass-split' },
                preparing: { color: 'text-primary', background: 'bg-primary-subtle', icon: 'bi-box-seam' },
                in_transit: { color: 'text-info-emphasis', background: 'bg-info-subtle', icon: 'bi-truck' },
                received: { color: 'text-success', background: 'bg-success-subtle', icon: 'bi-check-lg' },
                rejected: { color: 'text-danger', background: 'bg-danger-subtle', icon: 'bi-x-lg' },
                cancelled: { color: 'text-secondary', background: 'bg-secondary-subtle', icon: 'bi-slash-circle' },
            };
            request.statusHistory.forEach((entry, index) => {
                const item = document.createElement('article');
                item.className = `position-relative border-start ms-3 ps-4 ${index === request.statusHistory.length - 1 ? 'pb-0' : 'pb-4'}`;

                const style = statusStyles[entry.status] || statusStyles.pending;
                const marker = document.createElement('span');
                marker.className = `position-absolute top-0 start-0 translate-middle ms-0 rounded-circle d-flex align-items-center justify-content-center ${style.color} ${style.background}`;
                marker.style.width = '2rem';
                marker.style.height = '2rem';
                marker.setAttribute('aria-hidden', 'true');
                const markerIcon = document.createElement('i');
                markerIcon.className = `bi ${style.icon}`;
                marker.appendChild(markerIcon);

                const card = document.createElement('div');
                card.className = 'card border-0 shadow-sm';
                const body = document.createElement('div');
                body.className = 'card-body p-3';
                const heading = document.createElement('div');
                heading.className = 'd-flex flex-wrap align-items-center justify-content-between gap-2 mb-2';
                const status = document.createElement('h3');
                status.className = 'h6 mb-0';
                status.textContent = getStatusLabel(entry.status);
                const date = document.createElement('time');
                date.className = 'small text-secondary';
                if (entry.dateAndTime) {
                    date.dateTime = entry.dateAndTime.replace(' ', 'T');
                    date.textContent = formatDate(entry.dateAndTime);
                } else {
                    date.textContent = 'Date not recorded';
                }
                heading.append(status, date);

                const note = document.createElement('p');
                note.className = `small mb-0 ${entry.note ? 'text-body' : 'text-secondary'}`;
                note.textContent = entry.note || 'No note provided for this status.';
                body.append(heading, note);
                card.appendChild(body);
                item.append(marker, card);
                timeline.appendChild(item);
            });
        }
        historyModal.show();
    };

    const showReceiveForm = (request) => {
        document.getElementById('receiveDeliverySubtitle').textContent = request.id;
        document.getElementById('receivingStaff').value = state.staffName;
        document.getElementById('receivedAt').value = new Date().toLocaleString();
        document.getElementById('receivingNotes').value = '';
        document.getElementById('receiveError').textContent = '';
        const rows = document.getElementById('receiveDeliveryItems');
        rows.replaceChildren();
        request.items.forEach((item) => {
            const row = document.createElement('tr');
            row.dataset.requestItemId = item.requestItemId;
            const name = document.createElement('th');
            name.scope = 'row';
            name.append(document.createTextNode(item.name));
            const unit = document.createElement('small');
            unit.className = 'text-secondary fw-normal ms-1';
            unit.textContent = item.unitType;
            name.appendChild(unit);
            row.appendChild(name);
            appendCell(row, formatQuantity(item.quantity), 'text-end');
            ['received', 'discrepancy'].forEach((quantityType) => {
                const cell = appendCell(row, '');
                const input = document.createElement('input');
                input.className = 'form-control form-control-sm';
                input.type = 'number';
                input.min = '0';
                input.max = item.quantity;
                input.step = '0.01';
                input.required = true;
                input.value = quantityType === 'received' ? item.quantity : '0';
                input.dataset.quantityType = quantityType;
                input.setAttribute(
                    'aria-label',
                    `${item.name} ${quantityType === 'received' ? 'accepted' : 'missing or damaged'} quantity`,
                );
                cell.appendChild(input);
            });
            rows.appendChild(row);
        });
        receiveModal.show();
    };

    document.getElementById('receiveDeliveryItems').addEventListener('input', (event) => {
        const changedInput = event.target.closest('[data-quantity-type]');
        if (!changedInput || changedInput.value === '') return;
        const row = changedInput.closest('tr');
        const request = getActiveRequest();
        const item = request.items.find((requestItem) =>
            requestItem.requestItemId === Number(row.dataset.requestItemId)
        );
        const acceptedInput = row.querySelector('[data-quantity-type="received"]');
        const discrepancyInput = row.querySelector('[data-quantity-type="discrepancy"]');
        const changedValue = Math.min(Math.max(Number(changedInput.value), 0), Number(item.quantity));
        changedInput.value = changedValue;

        if (changedInput.dataset.quantityType === 'received') {
            discrepancyInput.value = Number(item.quantity) - changedValue;
        } else {
            acceptedInput.value = Number(item.quantity) - changedValue;
        }
    });

    const loadRequests = async () => {
        const data = await sendRequest('/supply/receive_stock/data');
        state.requests = data.requests;
        state.staffName = data.staffName;
        renderRequests();
    };

    const handleRequestAction = (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const requestId = Number(button.dataset.requestId);
        const request = state.requests.find((item) => item.id === requestId);
        if (!request) return;
        state.activeRequestId = requestId;
        if (button.dataset.action === 'view') showRequestDetails(request);
        if (button.dataset.action === 'history') showRequestHistory(request);
        if (button.dataset.action === 'cancel') {
            document.getElementById('cancelRequestSubtitle').textContent = request.id;
            cancelModal.show();
        }
        if (button.dataset.action === 'receive') showReceiveForm(request);
    };
    tableBody.addEventListener('click', handleRequestAction);
    deliveryTableBody.addEventListener('click', handleRequestAction);

    document.getElementById('confirmCancelRequest').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        message.classList.add('d-none');
        try {
            await sendRequest(`/supply/receive_stock/${state.activeRequestId}/cancel`, { method: 'PUT' });
            cancelModal.hide();
            await loadRequests();
            showMessage('Request cancelled.');
        } catch (error) {
            showMessage(error.message, 'danger');
        } finally {
            button.disabled = false;
        }
    });

    document.getElementById('receiveDeliveryForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = document.getElementById('saveReceipt');
        const error = document.getElementById('receiveError');
        const items = Array.from(document.querySelectorAll('#receiveDeliveryItems tr')).map((row) => {
            const values = Object.fromEntries(
                Array.from(row.querySelectorAll('[data-quantity-type]'))
                    .map((input) => [input.dataset.quantityType, Number(input.value)]),
            );
            return {
                requestItemId: Number(row.dataset.requestItemId),
                received: values.received,
                missing: values.discrepancy,
                damaged: 0,
            };
        });
        const request = getActiveRequest();
        const hasInvalidTotals = items.some((item, index) => {
            const requested = Number(request.items[index].quantity);
            return Math.abs(item.received + item.missing - requested) > 0.0000001;
        });
        if (hasInvalidTotals) {
            error.textContent = 'Accepted and missing/damaged quantities must equal the requested quantity for each item.';
            return;
        }

        button.disabled = true;
        error.textContent = '';
        message.classList.add('d-none');
        try {
            await sendRequest(`/supply/receive_stock/${state.activeRequestId}/receive`, {
                method: 'POST',
                body: JSON.stringify({ items, note: document.getElementById('receivingNotes').value }),
            });
            receiveModal.hide();
            await loadRequests();
            showMessage('Delivery received and branch inventory updated.');
        } catch (requestError) {
            error.textContent = requestError.message;
        } finally {
            button.disabled = false;
        }
    });

    loadRequests().catch((error) => {
        showMessage(error.message, 'danger');
        renderRequestRows([], deliveryTableBody, 'Unable to load branch requests.');
        renderRequestRows([], tableBody, 'Unable to load branch requests.');
        document.getElementById('deliveryRequestCount').textContent = 'Unable to load requests';
        document.getElementById('requestCount').textContent = 'Unable to load requests';
        document.getElementById('showingDeliveryRequests').textContent = '';
        document.getElementById('showingRequests').textContent = '';
        deliveryPagination.replaceChildren();
        pagination.replaceChildren();
    });
});
