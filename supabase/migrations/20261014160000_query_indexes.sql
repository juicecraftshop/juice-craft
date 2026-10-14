-- Additive indexes; no data, permissions or authentication changes.
-- Match LIMIT + ORDER BY so history pages do not sort all stored rows.
CREATE INDEX IF NOT EXISTS sales_date_time ON juicecraft.sales(date DESC,time DESC);
CREATE INDEX IF NOT EXISTS movements_time ON juicecraft.movements(time DESC);
CREATE INDEX IF NOT EXISTS movements_product_time ON juicecraft.movements(product,time DESC);
-- Only losses contribute to wastage totals; keep this index small.
CREATE INDEX IF NOT EXISTS movements_loss_date ON juicecraft.movements(date)
 WHERE type IN ('wastage','adjustment') AND qty<0;
