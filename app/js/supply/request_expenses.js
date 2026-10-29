document.addEventListener('DOMContentLoaded', () => {
    const pageSize = 10;
    const state = {
        stockItems: [],
        requestedStockItems: [],
        otherItems: [],
        pendingCompletion: null,
        requests: [],
        approvedPage: 1,
        otherPage: 1,
    };
    const expenseRows = document.getElementById('expenseItems');
    const catalogRows = document.getElementById('catalogItems');
    const expenseForm = document.getElementById('expenseForm');
    const otherItemFields = document.getElementById('otherItemFields');
    const message = document.getElementById('expenseMessage');
    const submitButton = document.getElementById('submitExpense');
    const expenseRequestRows = document.getElementById('expenseRequestRows');
    const approvedExpenseRequestRows = document.getElementById('approvedExpenseRequestRows');
    const approvedExpenseRequestPagination = document.getElementById('approvedExpenseRequestPagination');
    const showingApprovedExpenseRequests = document.getElementById('showingApprovedExpenseRequests');
    const expenseRequestPagination = document.getElementById('expenseRequestPagination');
    const showingExpenseRequests = document.getElementById('showingExpenseRequests');
    const expenseRequestModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('expenseRequestModal'));
    const expenseDetailsModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('expenseDetailsModal'));
    const completionModalElement = document.getElementById('completeExpenseModal');
    const completionModal = bootstrap.Modal.getOrCreateInstance(completionModalElement);
    const confirmCompletionButton = document.getElementById('confirmExpenseCompletion');
    const completionMessage = document.getElementById('completionMessage');
    const completionLoading = document.getElementById('completionLoading');
    const completionItems = document.getElementById('completionItems');
    const otherItemPanel = bootstrap.Collapse.getOrCreateInstance(document.getElementById('otherItemPanel'), { toggle: false });

    const formatMoney = (value) => `PHP ${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

    const showMessage = (text, type = 'success') => {
        message.className = `alert alert-${type}`;
        message.textContent = text;
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

    const addRemoveButton = (row, label, onRemove) => {
        const cell = appendCell(row, '', 'text-end pe-3');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-outline-secondary';
        button.setAttribute('aria-label', `Remove ${label}`);
        button.innerHTML = '<i class="bi bi-trash" aria-hidden="true"></i>';
        button.addEventListener('click', onRemove);
        cell.appendChild(button);
    };

    const updateTotal = () => {
        const stockTotal = state.requestedStockItems.reduce((total, item) => total + Number(item.totalPrice || 0), 0);
        const otherTotal = state.otherItems.reduce((total, item) => total + Number(item.totalPrice || 0), 0);
        document.getElementById('expenseTotal').textContent = formatMoney(stockTotal + otherTotal);
    };

    const renderRequestRows = (requests, container, emptyMessage) => {
        container.replaceChildren();
        if (requests.length === 0) {
            const row = document.createElement('tr');
            const cell = appendCell(row, emptyMessage, 'text-center text-secondary py-4');
            cell.colSpan = 7;
            container.appendChild(row);
            return;
        }

        requests.forEach((request) => {
            const row = document.createElement('tr');
            appendCell(row, `#${request.id}`, 'ps-3 fw-semibold');
            appendCell(row, request.branch_name);
            const date = new Date(`${request.date_and_time.replace(' ', 'T')}Z`);
            appendCell(row, Number.isNaN(date.getTime()) ? request.date_and_time : date.toLocaleString());
            appendCell(row, request.request_note || '—');

            const statusCell = appendCell(row, '');
            const status = document.createElement('span');
            const statusStyles = {
                approved: 'bg-success-subtle text-success-emphasis',
                completed: 'bg-primary-subtle text-primary-emphasis',
                rejected: 'bg-danger-subtle text-danger-emphasis',
                pending: 'bg-warning-subtle text-warning-emphasis',
            };
            status.className = `badge ${statusStyles[request.status] || 'bg-secondary-subtle text-secondary-emphasis'}`;
            status.textContent = request.status;
            statusCell.appendChild(status);
            appendCell(row, formatMoney(request.total_price), 'text-end pe-3 fw-semibold');

            const actionCell = appendCell(row, '', 'text-end pe-3');
            const viewButton = document.createElement('button');
            viewButton.className = 'btn btn-sm btn-outline-success';
            viewButton.type = 'button';
            viewButton.textContent = 'View notes & items';
            viewButton.addEventListener('click', () => loadRequestDetails(request.id));
            actionCell.appendChild(viewButton);
            if (request.status === 'approved') {
                const completeButton = document.createElement('button');
                completeButton.className = 'btn btn-sm btn-success ms-2';
                completeButton.type = 'button';
                completeButton.textContent = 'Complete';
                completeButton.addEventListener('click', () => openCompletionConfirmation(request.id, completeButton));
                actionCell.appendChild(completeButton);
            }
            container.appendChild(row);
        });
    };

    const renderRequestPagination = (requests, pageKey, paginationElement, summaryElement, requestLabel) => {
        const pageCount = Math.ceil(requests.length / pageSize);
        state[pageKey] = Math.min(state[pageKey], Math.max(pageCount, 1));
        const start = requests.length === 0 ? 0 : ((state[pageKey] - 1) * pageSize) + 1;
        const end = Math.min(state[pageKey] * pageSize, requests.length);
        summaryElement.textContent =
            `Showing ${start}–${end} of ${requests.length} ${requests.length === 1 ? requestLabel : `${requestLabel}s`}`;

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
            button.disabled = disabled;
            item.appendChild(button);
            paginationElement.appendChild(item);
        };
        addPageButton('Previous', Math.max(state[pageKey] - 1, 1), state[pageKey] <= 1);
        for (let page = 1; page <= lastPage; page += 1) {
            addPageButton(String(page), page, false, page === state[pageKey]);
        }
        addPageButton('Next', Math.min(state[pageKey] + 1, lastPage), state[pageKey] >= lastPage);
        return requests.slice((state[pageKey] - 1) * pageSize, state[pageKey] * pageSize);
    };

    const renderRequests = (requests) => {
        state.requests = requests;
        const approvedRequests = requests.filter((request) => request.status === 'approved');
        const otherRequests = requests.filter((request) => request.status !== 'approved');
        document.getElementById('expenseRequestCount').textContent =
            `${otherRequests.length} ${otherRequests.length === 1 ? 'request' : 'requests'}`;
        document.getElementById('approvedExpenseRequestCount').textContent =
            `${approvedRequests.length} ${approvedRequests.length === 1 ? 'approved request' : 'approved requests'}`;
        renderRequestRows(
            renderRequestPagination(otherRequests, 'otherPage', expenseRequestPagination, showingExpenseRequests, 'request'),
            expenseRequestRows,
            'No pending, rejected, or other requests yet.',
        );
        renderRequestRows(
            renderRequestPagination(
                approvedRequests,
                'approvedPage',
                approvedExpenseRequestPagination,
                showingApprovedExpenseRequests,
                'approved request',
            ),
            approvedExpenseRequestRows,
            'No approved expense requests yet.',
        );
    };

    const handlePaginationClick = (event, pageKey) => {
        const button = event.target.closest('button[data-page]');
        if (!button || button.disabled) return;
        state[pageKey] = Number(button.dataset.page);
        renderRequests(state.requests);
    };

    expenseRequestPagination.addEventListener('click', (event) => handlePaginationClick(event, 'otherPage'));
    approvedExpenseRequestPagination.addEventListener('click', (event) => handlePaginationClick(event, 'approvedPage'));

    const renderRequestDetails = (request, items) => {
        document.getElementById('expenseDetailsTitle').textContent = `Expense request #${request.id}`;
        const date = new Date(`${request.date_and_time.replace(' ', 'T')}Z`);
        const submittedAt = Number.isNaN(date.getTime()) ? request.date_and_time : date.toLocaleString();
        document.getElementById('expenseDetailsMeta').textContent =
            `${request.status} · Submitted ${submittedAt}`;
        document.getElementById('expenseDetailsSubmittedBy').textContent =
            `Submitted by ${request.user_name || 'Unknown user'} · ${request.branch_name}`;
        document.getElementById('expenseDetailsRequestNote').textContent = request.request_note || 'No request note.';

        const statusNoteLabel = request.status === 'rejected'
            ? 'Rejection note'
            : ['approved', 'completed'].includes(request.status) ? 'Approval note' : 'Status note';
        const statusNote = request.status === 'rejected'
            ? request.rejection_note
            : ['approved', 'completed'].includes(request.status) ? request.approved_note : null;
        document.getElementById('expenseDetailsStatusNoteLabel').textContent = statusNoteLabel;
        document.getElementById('expenseDetailsStatusNote').textContent =
            statusNote || (request.status === 'pending' ? 'Awaiting review.' : 'No status note.');
        document.getElementById('expenseDetailsTotal').textContent = formatMoney(request.total_price);

        const itemRows = document.getElementById('expenseDetailsItems');
        itemRows.replaceChildren();
        if (items.length === 0) {
            const row = document.createElement('tr');
            const cell = appendCell(row, 'No items found for this request.', 'text-center text-secondary py-3');
            cell.colSpan = 3;
            itemRows.appendChild(row);
        }
        items.forEach((item) => {
            const row = document.createElement('tr');
            const nameCell = appendCell(row, item.item);
            const unit = document.createElement('small');
            unit.className = 'd-block text-secondary';
            unit.textContent = item.unit_type;
            nameCell.appendChild(unit);
            appendCell(row, item.quantity);
            appendCell(row, formatMoney(item.total_price), 'text-end');
            itemRows.appendChild(row);
        });
        expenseDetailsModal.show();
    };

    const loadRequestDetails = async (requestId) => {
        try {
            const data = await request(`/supply/request_expenses/requests/${requestId}`);
            renderRequestDetails(data.request, data.items);
        } catch (error) {
            showMessage(error.message, 'danger');
        }
    };

    const loadRequests = async () => {
        const data = await request('/supply/request_expenses/requests');
        renderRequests(data.requests);
    };

    const openCompletionConfirmation = async (requestId, button) => {
        const pendingCompletion = { requestId, button };
        state.pendingCompletion = pendingCompletion;
        button.disabled = true;
        document.getElementById('completionRequestId').textContent = `#${requestId}`;
        document.getElementById('completionRequestNote').textContent = 'Loading request details…';
        document.getElementById('completionSubmittedBy').textContent = '';
        document.getElementById('completionTotal').textContent = formatMoney(0);
        completionItems.replaceChildren();
        completionLoading.classList.remove('d-none');
        completionMessage.classList.add('d-none');
        confirmCompletionButton.disabled = true;
        completionModal.show();

        try {
            const data = await request(`/supply/request_expenses/requests/${requestId}`);
            if (state.pendingCompletion !== pendingCompletion) return;

            document.getElementById('completionRequestNote').textContent =
                data.request.request_note || 'No request note.';
            document.getElementById('completionSubmittedBy').textContent =
                `Submitted by ${data.request.user_name || 'Unknown user'} · ${data.request.branch_name}`;
            document.getElementById('completionTotal').textContent = formatMoney(data.request.total_price);
            data.items.forEach((item) => {
                const row = document.createElement('tr');
                const nameCell = appendCell(row, item.item);
                const unit = document.createElement('small');
                unit.className = 'd-block text-secondary';
                unit.textContent = item.unit_type;
                nameCell.appendChild(unit);
                appendCell(row, item.is_other ? 'Other item — will not add' : 'Add to inventory');
                appendCell(row, item.quantity);
                appendCell(row, formatMoney(item.total_price), 'text-end');
                completionItems.appendChild(row);
            });
            if (data.items.length === 0) {
                const row = document.createElement('tr');
                const cell = appendCell(row, 'No items found for this request.', 'text-center text-secondary py-3');
                cell.colSpan = 4;
                completionItems.appendChild(row);
            }
            completionLoading.classList.add('d-none');
            if (data.request.status !== 'approved') {
                completionMessage.textContent = `This request is ${data.request.status} and can no longer be completed.`;
                completionMessage.className = 'alert alert-warning';
                return;
            }
            confirmCompletionButton.disabled = false;
        } catch (error) {
            if (state.pendingCompletion !== pendingCompletion) return;
            completionLoading.classList.add('d-none');
            completionMessage.textContent = error.message;
            completionMessage.className = 'alert alert-danger';
        }
    };

    const completeRequest = async () => {
        if (!state.pendingCompletion) return;

        const { requestId, button } = state.pendingCompletion;
        const dismissButtons = completionModalElement.querySelectorAll('[data-bs-dismiss="modal"]');
        confirmCompletionButton.disabled = true;
        dismissButtons.forEach((dismissButton) => { dismissButton.disabled = true; });
        completionMessage.classList.add('d-none');
        try {
            const result = await request(`/supply/request_expenses/requests/${requestId}/complete`, {
                method: 'PUT',
            });
            state.pendingCompletion = null;
            completionModal.hide();
            showMessage(result.message, 'success');
            try {
                await loadRequests();
            } catch (error) {
                showMessage(`Request completed, but the request list could not be refreshed: ${error.message}`, 'warning');
            }
        } catch (error) {
            completionMessage.textContent = error.message;
            completionMessage.className = 'alert alert-danger';
        } finally {
            confirmCompletionButton.disabled = false;
            dismissButtons.forEach((dismissButton) => { dismissButton.disabled = false; });
            button.disabled = false;
        }
    };

    confirmCompletionButton.addEventListener('click', completeRequest);
    completionModalElement.addEventListener('hidden.bs.modal', () => {
        if (state.pendingCompletion) {
            state.pendingCompletion.button.disabled = false;
            state.pendingCompletion = null;
        }
    });

    const renderItems = () => {
        expenseRows.replaceChildren();
        document.getElementById('expenseItemCount').textContent =
            `${state.requestedStockItems.length + state.otherItems.length} items in this request`;

        if (state.requestedStockItems.length + state.otherItems.length === 0) {
            const row = document.createElement('tr');
            const cell = appendCell(row, 'Add stock items or other expenses to start your request.', 'text-center text-secondary py-4');
            cell.colSpan = 4;
            expenseRows.appendChild(row);
            updateTotal();
            return;
        }

        state.requestedStockItems.forEach((item) => {
            const row = document.createElement('tr');
            const nameCell = appendCell(row, '', 'ps-3 fw-medium');
            nameCell.append(document.createTextNode(item.name));
            const unit = document.createElement('small');
            unit.className = 'd-block text-secondary fw-normal';
            unit.textContent = item.unit_type;
            nameCell.appendChild(unit);

            const quantityCell = appendCell(row, '');
            const quantity = document.createElement('input');
            quantity.className = 'form-control';
            quantity.type = 'number';
            quantity.min = '0.01';
            quantity.step = '0.01';
            quantity.required = true;
            quantity.value = item.quantity;
            quantity.setAttribute('aria-label', `${item.name} quantity`);
            quantity.addEventListener('input', () => { item.quantity = quantity.value; });
            quantityCell.appendChild(quantity);

            const priceCell = appendCell(row, '');
            const totalPrice = document.createElement('input');
            totalPrice.className = 'form-control';
            totalPrice.type = 'number';
            totalPrice.min = '0.01';
            totalPrice.step = '0.01';
            totalPrice.required = true;
            totalPrice.value = item.totalPrice;
            totalPrice.setAttribute('aria-label', `${item.name} total price in PHP`);
            totalPrice.addEventListener('input', () => {
                item.totalPrice = totalPrice.value;
                updateTotal();
            });
            priceCell.appendChild(totalPrice);
            addRemoveButton(row, item.name, () => {
                state.requestedStockItems = state.requestedStockItems.filter((current) => current.id !== item.id);
                renderItems();
                renderCatalog();
            });
            expenseRows.appendChild(row);
        });

        state.otherItems.forEach((item, index) => {
            const row = document.createElement('tr');
            const nameCell = appendCell(row, '', 'ps-3 fw-medium');
            nameCell.append(document.createTextNode(item.name));
            const unit = document.createElement('small');
            unit.className = 'd-block text-secondary fw-normal';
            unit.textContent = item.unitType;
            nameCell.appendChild(unit);

            const quantityCell = appendCell(row, '');
            const quantity = document.createElement('input');
            quantity.className = 'form-control';
            quantity.type = 'number';
            quantity.min = '0.01';
            quantity.step = '0.01';
            quantity.required = true;
            quantity.value = item.quantity;
            quantity.setAttribute('aria-label', `${item.name} quantity`);
            quantity.addEventListener('input', () => {
                item.quantity = quantity.value;
            });
            quantityCell.appendChild(quantity);

            const totalCell = appendCell(row, '');
            const totalPrice = document.createElement('input');
            totalPrice.className = 'form-control';
            totalPrice.type = 'number';
            totalPrice.min = '0.01';
            totalPrice.step = '0.01';
            totalPrice.required = true;
            totalPrice.value = item.totalPrice;
            totalPrice.setAttribute('aria-label', `${item.name} total price in PHP`);
            totalPrice.addEventListener('input', () => {
                item.totalPrice = totalPrice.value;
                updateTotal();
            });
            totalCell.appendChild(totalPrice);
            addRemoveButton(row, item.name, () => {
                state.otherItems.splice(index, 1);
                renderItems();
            });
            expenseRows.appendChild(row);
        });
        updateTotal();
    };

    const renderCatalog = () => {
        catalogRows.replaceChildren();
        const availableItems = state.stockItems.filter(
            (item) => !state.requestedStockItems.some((requested) => requested.id === item.id),
        );
        if (availableItems.length === 0) {
            const row = document.createElement('tr');
            const cell = appendCell(row, 'No stock catalog items available to add.', 'text-center text-secondary py-4');
            cell.colSpan = 3;
            catalogRows.appendChild(row);
            return;
        }

        availableItems.forEach((item) => {
            const row = document.createElement('tr');
            const nameCell = appendCell(row, item.name);
            const unit = document.createElement('small');
            unit.className = 'd-block text-secondary';
            unit.textContent = item.unit_type;
            nameCell.appendChild(unit);
            appendCell(row, formatMoney(item.unit_cost));
            const actionCell = appendCell(row, '', 'text-end');
            const button = document.createElement('button');
            button.className = 'btn btn-sm btn-outline-success';
            button.type = 'button';
            button.textContent = 'Add';
            button.addEventListener('click', () => {
                state.requestedStockItems.push({ ...item, quantity: 1, totalPrice: '' });
                renderItems();
                renderCatalog();
            });
            actionCell.appendChild(button);
            catalogRows.appendChild(row);
        });
    };

    const loadRequestData = async () => {
        const data = await request('/supply/request_expenses/data');
        state.stockItems = data.stockItems;
        document.getElementById('expenseRequestBranch').textContent = data.branchName || 'Branch not available';
        document.getElementById('expenseRequestStaff').textContent = data.staffName || 'User name not available';
        renderItems();
        renderCatalog();
    };

    document.getElementById('otherItemPanel').addEventListener('shown.bs.collapse', () => {
        otherItemFields.disabled = false;
    });
    document.getElementById('otherItemPanel').addEventListener('hidden.bs.collapse', () => {
        otherItemFields.disabled = true;
    });

    document.getElementById('addOtherItem').addEventListener('click', () => {
        for (const input of otherItemFields.querySelectorAll('input')) {
            if (!input.reportValidity()) return;
        }
        const item = {
            name: document.getElementById('otherItemName').value.trim(),
            unitType: document.getElementById('otherItemUnit').value.trim(),
            quantity: document.getElementById('otherItemQuantity').value,
            totalPrice: document.getElementById('otherItemPrice').value,
        };
        state.otherItems.push(item);
        otherItemFields.querySelectorAll('input').forEach((input) => { input.value = ''; });
        document.getElementById('otherItemQuantity').value = '1';
        otherItemPanel.hide();
        renderItems();
    });

    expenseForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (state.requestedStockItems.length + state.otherItems.length === 0) {
            showMessage('Add at least one expense item before submitting.', 'warning');
            return;
        }
        if (!expenseForm.reportValidity()) return;

        submitButton.disabled = true;
        try {
            const result = await request('/supply/request_expenses', {
                method: 'POST',
                body: JSON.stringify({
                    stockItems: state.requestedStockItems.map((item) => ({
                        generalStockItemId: item.id,
                        quantity: Number(item.quantity),
                        totalPrice: Number(item.totalPrice),
                    })),
                    otherItems: state.otherItems.map((item) => ({
                        item: item.name,
                        unitType: item.unitType,
                        quantity: Number(item.quantity),
                        totalPrice: Number(item.totalPrice),
                    })),
                    requestNote: document.getElementById('expenseNote').value,
                }),
            });
            showMessage(
                `Expense request #${result.requestId} ${result.status === 'approved' ? 'automatically approved' : 'submitted for review'}. Total: ${formatMoney(result.totalPrice)}.`,
                'success',
            );
            state.requestedStockItems = [];
            state.otherItems = [];
            expenseForm.reset();
            renderItems();
            renderCatalog();
            expenseRequestModal.hide();
            try {
                await loadRequests();
            } catch (error) {
                showMessage(`Request submitted, but the request list could not be refreshed: ${error.message}`, 'warning');
            }
        } catch (error) {
            showMessage(error.message, 'danger');
        } finally {
            submitButton.disabled = false;
        }
    });

    loadRequestData().catch((error) => {
        showMessage(error.message, 'danger');
        document.getElementById('expenseItemCount').textContent = 'Unable to load stock catalog';
        document.getElementById('expenseRequestBranch').textContent = 'Branch unavailable';
        document.getElementById('expenseRequestStaff').textContent = 'User name unavailable';
    });
    loadRequests().catch((error) => {
        showMessage(error.message, 'danger');
        document.getElementById('expenseRequestCount').textContent = 'Unable to load requests';
        document.getElementById('approvedExpenseRequestCount').textContent = 'Unable to load approved requests';
        renderRequestRows([], expenseRequestRows, 'Unable to load expense requests.');
        renderRequestRows([], approvedExpenseRequestRows, 'Unable to load approved expense requests.');
        showingExpenseRequests.textContent = '';
        expenseRequestPagination.replaceChildren();
        showingApprovedExpenseRequests.textContent = '';
        approvedExpenseRequestPagination.replaceChildren();
    });
});
