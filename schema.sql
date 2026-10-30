CREATE TABLE IF NOT EXISTS "user" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS branch_location (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_name TEXT UNIQUE NOT NULL,
    address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS general_stock_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit_type TEXT NOT NULL,
    unit_cost REAL NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS branch_inventory_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_location_id INTEGER NOT NULL REFERENCES branch_location(id) ON DELETE CASCADE,
    general_stock_item_id INTEGER NOT NULL REFERENCES general_stock_item(id) ON DELETE CASCADE,
    quantity REAL NOT NULL DEFAULT 0.00 CHECK (quantity >= 0),
    low_quantity_threshold REAL NOT NULL DEFAULT 0.00 CHECK (low_quantity_threshold >= 0),
    restock_target_quantity REAL NOT NULL DEFAULT 0.00 CHECK (
        restock_target_quantity >= low_quantity_threshold
    ),
    CONSTRAINT unique_branch_stock_item UNIQUE (branch_location_id, general_stock_item_id)
);

CREATE TABLE IF NOT EXISTS branch_inventory_manager_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_location_id INTEGER NOT NULL REFERENCES branch_location(id) ON DELETE CASCADE,
    branch_inventory_item_id INTEGER NOT NULL REFERENCES branch_inventory_item(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES "user"(id),
    date_and_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    value_before REAL NOT NULL,
    value_after REAL NOT NULL,
    reason TEXT
);

CREATE TABLE IF NOT EXISTS branch_restock_request (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_location_id INTEGER NOT NULL REFERENCES branch_location(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES "user"(id),
    date_and_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note TEXT,
    rejection_note TEXT,
    preparation_note TEXT,
    transit_note TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS branch_restock_request_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_restock_request_id INTEGER NOT NULL REFERENCES branch_restock_request(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    note TEXT,
    date_and_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES "user"(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS branch_restock_request_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_restock_request_id INTEGER NOT NULL REFERENCES branch_restock_request(id) ON DELETE CASCADE,
    general_stock_item_id INTEGER NOT NULL REFERENCES general_stock_item(id),
    quantity REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS branch_stock_received_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_restock_request_id INTEGER NOT NULL REFERENCES branch_restock_request(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES "user"(id),
    note TEXT,
    date_and_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS branch_stock_received_log_lost_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_stock_received_log_id INTEGER NOT NULL REFERENCES branch_stock_received_log(id) ON DELETE CASCADE,
    branch_restock_request_item_id INTEGER NOT NULL REFERENCES branch_restock_request_item(id) ON DELETE CASCADE,
    quantity REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS branch_expense_request (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES "user"(id),
    branch_location_id INTEGER NOT NULL REFERENCES branch_location(id),
    request_note TEXT,
    rejection_note TEXT,
    approved_note TEXT,
    date_and_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_price REAL NOT NULL DEFAULT 0.00 CHECK (total_price >= 0),
    status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS expense_auto_approval_setting (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    max_total_price REAL NOT NULL DEFAULT 0 CHECK (max_total_price >= 0)
);

INSERT OR IGNORE INTO expense_auto_approval_setting (id, max_total_price)
VALUES (1, 0);

CREATE INDEX IF NOT EXISTS idx_branch_expense_request_branch_date
    ON branch_expense_request (branch_location_id, date_and_time DESC, id DESC);

CREATE TABLE IF NOT EXISTS branch_expense_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_expense_request_id INTEGER NOT NULL REFERENCES branch_expense_request(id) ON DELETE CASCADE,
    general_stock_item_id INTEGER NOT NULL REFERENCES general_stock_item(id),
    quantity REAL NOT NULL CHECK (quantity > 0),
    total_price REAL NOT NULL CHECK (total_price >= 0)
);

CREATE TABLE IF NOT EXISTS branch_expense_other_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_expense_request_id INTEGER NOT NULL REFERENCES branch_expense_request(id) ON DELETE CASCADE,
    item TEXT NOT NULL,
    unit_type TEXT NOT NULL,
    quantity REAL NOT NULL CHECK (quantity > 0),
    total_price REAL NOT NULL CHECK (total_price > 0)
);

CREATE TABLE IF NOT EXISTS menu_section (
    section_id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_name TEXT NOT NULL,
    is_available INTEGER NOT NULL DEFAULT 1,
    is_archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_products (
    product_id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    is_available INTEGER NOT NULL DEFAULT 1,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    image_url TEXT,
    allow_quantity INTEGER NOT NULL DEFAULT 1,
    is_archived INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (section_id) REFERENCES menu_section(section_id)
);

CREATE TABLE IF NOT EXISTS product_addons (
    addon_id INTEGER PRIMARY KEY AUTOINCREMENT,
    addon_name TEXT NOT NULL,
    addon_price REAL NOT NULL,
    is_available INTEGER NOT NULL DEFAULT 1,
    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    addon_category TEXT DEFAULT 'extra'
);

CREATE TABLE IF NOT EXISTS orders (
    order_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_datetime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cust_name TEXT,
    contact_number TEXT,
    order_status TEXT NOT NULL DEFAULT 'Pending',
    order_total REAL NOT NULL DEFAULT 0.00,
    notes TEXT,
    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    branch_name TEXT NOT NULL,
    order_type TEXT NOT NULL DEFAULT 'Dine-In',
    other_contact TEXT,
    paymongo_link_id TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
    order_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    unit_price REAL NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    subtotal REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES menu_products(product_id)
);

CREATE TABLE IF NOT EXISTS order_item_addons (
    order_item_addon_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_item_id INTEGER NOT NULL,
    addon_id INTEGER,
    addon_name TEXT NOT NULL,
    addon_price REAL NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    subtotal REAL NOT NULL,
    FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
    payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    amount_due REAL NOT NULL,
    amount_paid REAL NOT NULL,
    change_amount REAL NOT NULL DEFAULT 0.00,
    gcash_reference_number TEXT NULL,
    payment_status TEXT NOT NULL DEFAULT 'Pending',
    paid_at DATETIME,
    paymongo_payment_intent_id TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS receipts (
    receipt_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    payment_id INTEGER NOT NULL,
    transaction_number TEXT NOT NULL UNIQUE,
    receipt_type TEXT NOT NULL DEFAULT 'Printed',
    issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (payment_id) REFERENCES payments(payment_id)
);