-- Per-thickness optional price overrides + ensure catalogue layers exist

ALTER TABLE product_thicknesses ADD COLUMN mrp REAL;
ALTER TABLE product_thicknesses ADD COLUMN dealer_price REAL;

INSERT OR IGNORE INTO product_layers (id, title, sort_order) VALUES
  ('layer-1', '3 & 5 Years Guarantee', 1),
  ('layer-2', '7 Years Guarantee', 2),
  ('layer-3', '10 Years Guarantee', 3),
  ('layer-4', '12 Years Guarantee', 4);
