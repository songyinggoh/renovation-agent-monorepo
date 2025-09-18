-- Sample data for development and testing
-- Run this after schema.sql to populate the database with test data

-- Insert sample categories
INSERT INTO categories (name, description, slug) VALUES 
('Electronics', 'Electronic devices and accessories', 'electronics'),
('Clothing', 'Apparel and fashion items', 'clothing'),
('Books', 'Books and educational materials', 'books'),
('Home & Garden', 'Home improvement and gardening supplies', 'home-garden')
ON CONFLICT (slug) DO NOTHING;

-- Insert sample items
INSERT INTO items (name, description, price, category_id, image_url) VALUES 
('Smartphone', 'Latest model smartphone with advanced features', 699.99, 1, 'https://example.com/smartphone.jpg'),
('Laptop', 'High-performance laptop for work and gaming', 1299.99, 1, 'https://example.com/laptop.jpg'),
('T-Shirt', 'Comfortable cotton t-shirt', 29.99, 2, 'https://example.com/tshirt.jpg'),
('Jeans', 'Classic blue jeans', 79.99, 2, 'https://example.com/jeans.jpg'),
('Programming Book', 'Learn modern web development', 49.99, 3, 'https://example.com/book.jpg'),
('Garden Tool Set', 'Complete set of gardening tools', 89.99, 4, 'https://example.com/tools.jpg');

-- Insert sample users (passwords are hashed - in real app use proper password hashing)
INSERT INTO users (email, name, password_hash, role) VALUES 
('admin@example.com', 'Admin User', '$2b$10$hashedpassword1', 'admin'),
('user@example.com', 'Regular User', '$2b$10$hashedpassword2', 'user'),
('manager@example.com', 'Manager User', '$2b$10$hashedpassword3', 'manager')
ON CONFLICT (email) DO NOTHING;

-- Insert sample orders
INSERT INTO orders (user_id, total_amount, status, payment_status, shipping_address) VALUES 
(2, 729.98, 'completed', 'paid', '{"street": "123 Main St", "city": "Anytown", "state": "CA", "zip": "12345"}'),
(2, 109.98, 'processing', 'paid', '{"street": "123 Main St", "city": "Anytown", "state": "CA", "zip": "12345"}'),
(3, 49.99, 'pending', 'pending', '{"street": "456 Oak Ave", "city": "Other City", "state": "NY", "zip": "67890"}');

-- Insert sample order items
INSERT INTO order_items (order_id, item_id, quantity, price) VALUES 
(1, 1, 1, 699.99),  -- Smartphone
(1, 3, 1, 29.99),   -- T-Shirt
(2, 4, 1, 79.99),   -- Jeans
(2, 3, 1, 29.99),   -- T-Shirt
(3, 5, 1, 49.99);   -- Programming Book