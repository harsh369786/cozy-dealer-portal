-- Foldable/Pillow were product categories, not warranty values
UPDATE products SET guarantee = '3 Years' WHERE guarantee IN ('Foldable', 'Pillow');
