document.addEventListener('DOMContentLoaded', () => {
    const pageSize = 10;
    const state = { requests: [], activeRequest: null, page: 1 };
    const tableBody = document.getElementById('expenseRequests');
    const pagination = document.getElementById('expenseRequestsPagination');
    const message = document.getElementById('expenseMessage');
    const detailsModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('expenseDetailsModal'));
    const reviewModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('reviewExpenseModal'));
    const reviewForm = document.getElementById('reviewExpenseForm');

    const formatMoney = (value) => `PHP ${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

    const formatDate = (value) => {
        const date = new Date(value.replace(' ', 'T'));
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    };

    const getTodayRange = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        return { today, tomorrow };
    };

    const showMessage = (text, type = 'danger') => {
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

    const appendCell = (row, text, className = '') => {
        const cell = document.createElement('td');
        cell.textContent = text;
        if (className) cell.className = className;
        row.appendChild(cell);
        return cell;
    };

    const addButton = (container, label, className, onClick) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn btn-sm ${className}`;
        button.textContent = label;
        button.addEventListener('click', onClick);
        container.appendChild(button);
    };

    const getFilteredRequests = () => {
        const search = document.getElementById('expenseSearch').value.trim().toLowerCase();
        const status = document.getElementById('expenseStatusFilter').value;
        const dateFilter = document.getElementById('expenseDateFilter').value;
        const sort = document.getElementById('expenseSort').value;
        const { today, tomorrow } = getTodayRange();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        const startOfNextWeek = new Date(startOfWeek);
        startOfNextWeek.setDate(startOfWeek.getDate() + 7);
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const matchesDate = (submittedAt) => {
            if (!dateFilter) return true;
            if (dateFilter === 'today') return submittedAt >= today && submittedAt < tomorrow;
            if (dateFilter === 'week') return submittedAt >= startOfWeek && submittedAt < startOfNextWeek;
            return submittedAt >= startOfMonth && submittedAt < startOfNextMonth;
        };
        const requests = state.requests.filter((expense) => {
            const matchesSearch = [
                String(expense.id),
                expense.branch_name,
                expense.user_name,
                expense.request_note || '',
                expense.item_names || '',
            ].some((value) => value.toLowerCase().includes(search));
            const submittedAt = new Date(expense.date_and_time.replace(' ', 'T'));
            return matchesSearch && matchesDate(submittedAt) && (!status || expense.status === status);
        });

        requests.sort((left, right) => {
            if (sort === 'oldest') return new Date(left.date_and_time) - new Date(right.date_and_time);
            if (sort === 'highest') return right.total_price - left.total_price;
            if (sort === 'lowest') return left.total_price - right.total_price;
            return new Date(right.date_and_time) - new Date(left.date_and_time);
        });
        return requests;
    };

    const renderRequests = () => {
        const requests = getFilteredRequests();
        tableBody.replaceChildren();

        const pendingCount = state.requests.filter((expense) => expense.status === 'pending').length;
        const { today, tomorrow } = getTodayRange();
        const approvedTotal = state.requests
            .filter((expense) => {
                if (!['approved', 'completed'].includes(expense.status)) return false;
                const submittedAt = new Date(expense.date_and_time.replace(' ', 'T'));
                return submittedAt >= today && submittedAt < tomorrow;
            })
            .reduce((total, expense) => total + Number(expense.total_price), 0);
        document.getElementById('pendingExpenseCount').textContent = pendingCount;
        document.getElementById('approvedExpenseTotal').textContent = formatMoney(approvedTotal);
        document.getElementById('expenseRequestCount').textContent =
            `${state.requests.length} ${state.requests.length === 1 ? 'request' : 'requests'}`;
        const pageCount = Math.ceil(requests.length / pageSize);
        state.page = Math.min(state.page, Math.max(pageCount, 1));
        const start = requests.length === 0 ? 0 : ((state.page - 1) * pageSize) + 1;
        const end = Math.min(state.page * pageSize, requests.length);
        document.getElementById('showingExpenses').textContent =
            `Showing ${start}–${end} of ${requests.length} filtered ${requests.length === 1 ? 'request' : 'requests'} (${state.requests.length} total)`;

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

        if (requests.length === 0) {
            const row = document.createElement('tr');
            const cell = appendCell(
                row,
                state.requests.length ? 'No requests match these filters.' : 'There are no expense requests yet.',
                'text-center text-secondary py-4',
            );
            cell.colSpan = 7;
            tableBody.appendChild(row);
            return;
        }

        requests.slice((state.page - 1) * pageSize, state.page * pageSize).forEach((expense) => {
            const row = document.createElement('tr');
            const requestCell = appendCell(row, '', 'ps-3 fw-semibold');
            requestCell.append(document.createTextNode(`#${expense.id}`));
            const note = document.createElement('small');
            note.className = 'd-block text-secondary fw-normal';
            note.textContent = expense.request_note || 'No request note';
            requestCell.appendChild(note);
            appendCell(row, expense.branch_name);
            appendCell(row, formatDate(expense.date_and_time), 'text-nowrap');
            appendCell(row, `${expense.item_count} ${expense.item_count === 1 ? 'item' : 'items'}`);
            appendCell(row, formatMoney(expense.total_price), 'text-end fw-semibold');

            const statusCell = appendCell(row, '');
            const badge = document.createElement('span');
            const statusStyles = {
                pending: 'bg-warning-subtle text-warning-emphasis',
                approved: 'bg-success-subtle text-success-emphasis',
                completed: 'bg-primary-subtle text-primary-emphasis',
                rejected: 'bg-danger-subtle text-danger-emphasis',
            };

            pagination.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-page]');
                if (!button || button.disabled) return;
                state.page = Number(button.dataset.page);
                renderRequests();
            });
            badge.className = `badge ${statusStyles[expense.status] || 'bg-secondary-subtle text-secondary-emphasis'}`;
            badge.textContent = expense.status;
            statusCell.appendChild(badge);

            const actionCell = appendCell(row, '', 'text-end pe-3 text-nowrap');
            addButton(actionCell, 'Details', 'btn-outline-primary me-1', () => loadDetails(expense.id));
            if (expense.status === 'pending') {
                addButton(actionCell, 'Review', 'btn-outline-success', () => openReview(expense));
            }
            tableBody.appendChild(row);
        });
    };

    const renderDetails = (expense, items) => {
        document.getElementById('expenseDetailsTitle').textContent = `Expense request #${expense.id}`;
        document.getElementById('expenseDetailsMeta').textContent =
            `${expense.status} · Submitted ${formatDate(expense.date_and_time)}`;
        document.getElementById('expenseDetailsRequester').textContent =
            `Submitted by ${expense.user_name || 'Unknown user'} · ${expense.branch_name}`;
        document.getElementById('expenseDetailsNote').textContent =
            expense.request_note || 'No request note.';
        const statusNote = ['approved', 'completed'].includes(expense.status) ? expense.approved_note
            : expense.status === 'rejected' ? expense.rejection_note : '';
        document.getElementById('expenseDetailsStatusNoteLabel').textContent =
            ['approved', 'completed'].includes(expense.status) ? 'Approval note'
                : expense.status === 'rejected' ? 'Rejection note' : 'Review note';
        document.getElementById('expenseDetailsStatusNote').textContent =
            statusNote || (expense.status === 'pending' ? 'Awaiting review.' : 'No status note.');
        document.getElementById('expenseDetailsTotal').textContent = formatMoney(expense.total_price);

        const itemsBody = document.getElementById('expenseDetailsItems');
        itemsBody.replaceChildren();
        if (items.length === 0) {
            const row = document.createElement('tr');
            const cell = appendCell(row, 'No items found for this request.', 'text-center text-secondary py-3');
            cell.colSpan = 3;
            itemsBody.appendChild(row);
        } else {
            items.forEach((item) => {
                const row = document.createElement('tr');
                const nameCell = appendCell(row, item.item);
                const unit = document.createElement('small');
                unit.className = 'd-block text-secondary';
                unit.textContent = item.unit_type;
                nameCell.appendChild(unit);
                appendCell(row, item.quantity);
                appendCell(row, formatMoney(item.total_price), 'text-end');
                itemsBody.appendChild(row);
            });
        }

        const reviewButton = document.getElementById('reviewExpenseButton');
        reviewButton.classList.toggle('d-none', expense.status !== 'pending');
        reviewButton.onclick = () => openReview(expense);
    };

    const loadDetails = async (requestId) => {
        try {
            const data = await request(`/supply/manage_expenses/requests/${requestId}`);
            state.activeRequest = data.request;
            renderDetails(data.request, data.items);
            detailsModal.show();
        } catch (error) {
            showMessage(error.message);
        }
    };

    const openReview = (expense) => {
        state.activeRequest = expense;
        document.getElementById('reviewExpenseMeta').textContent =
            `Request #${expense.id} · ${expense.branch_name} · ${formatMoney(expense.total_price)}`;
        document.getElementById('reviewExpenseNote').value = '';
        detailsModal.hide();
        reviewModal.show();
    };

    const loadRequests = async () => {
        const data = await request('/supply/manage_expenses/data');
        state.requests = data.requests;
        renderRequests();
    };

    const loadAutoApprovalSetting = async () => {
        const data = await request('/supply/manage_expenses/auto-approval');
        document.getElementById('autoApprovalLimit').value = data.maxAutoApprovePrice;
    };

    document.getElementById('saveAutoApprovalSetting').addEventListener('click', async (event) => {
        const input = document.getElementById('autoApprovalLimit');
        if (!input.reportValidity()) return;

        const button = event.currentTarget;
        button.disabled = true;
        try {
            const result = await request('/supply/manage_expenses/auto-approval', {
                method: 'PUT',
                body: JSON.stringify({ maxAutoApprovePrice: Number(input.value) }),
            });
            input.value = result.maxAutoApprovePrice;
            showMessage(result.message, 'success');
        } catch (error) {
            showMessage(error.message);
        } finally {
            button.disabled = false;
        }
    });

    const resetPageAndRender = () => {
        state.page = 1;
        renderRequests();
    };
    document.getElementById('expenseSearch').addEventListener('input', resetPageAndRender);
    document.getElementById('expenseStatusFilter').addEventListener('change', resetPageAndRender);
    document.getElementById('expenseDateFilter').addEventListener('change', resetPageAndRender);
    document.getElementById('expenseSort').addEventListener('change', resetPageAndRender);

    reviewForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const status = event.submitter.value;
        const buttons = reviewForm.querySelectorAll('button[type="submit"]');
        buttons.forEach((button) => { button.disabled = true; });
        try {
            const result = await request(
                `/supply/manage_expenses/requests/${state.activeRequest.id}/status`,
                {
                    method: 'PUT',
                    body: JSON.stringify({
                        status,
                        note: document.getElementById('reviewExpenseNote').value,
                    }),
                },
            );
            reviewModal.hide();
            showMessage(result.message, 'success');
            await loadRequests();
        } catch (error) {
            showMessage(error.message);
        } finally {
            buttons.forEach((button) => { button.disabled = false; });
        }
    });

    loadAutoApprovalSetting().catch((error) => {
        showMessage(error.message);
        document.getElementById('autoApprovalLimit').disabled = true;
        document.getElementById('saveAutoApprovalSetting').disabled = true;
    });
    loadRequests().catch((error) => {
        showMessage(error.message);
        document.getElementById('expenseRequestCount').textContent = 'Unable to load requests';
        document.getElementById('showingExpenses').textContent = 'Unable to load requests';
        pagination.replaceChildren();
        const row = document.createElement('tr');
        const cell = appendCell(row, 'Unable to load expense requests.', 'text-center text-secondary py-4');
        cell.colSpan = 7;
        tableBody.replaceChildren(row);
    });
});
