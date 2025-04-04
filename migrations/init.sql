CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    account_number VARCHAR(20) UNIQUE NOT NULL
);

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    transaction_date TIMESTAMP NOT NULL,
    credit NUMERIC(15,2),
    debit NUMERIC(15,2),
    category VARCHAR(100),
    transaction_partner VARCHAR(255),
    description TEXT,
    balance NUMERIC(15,2) NOT NULL
);
