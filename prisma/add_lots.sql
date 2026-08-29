-- Lot / Batch tracking
CREATE TABLE lots (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_number    TEXT        NOT NULL,
  sku_id        TEXT        NOT NULL REFERENCES catalog_items(id),
  warehouse_id  TEXT        NOT NULL REFERENCES warehouses(id),
  received_qty  INTEGER     NOT NULL DEFAULT 0,
  remaining_qty INTEGER     NOT NULL DEFAULT 0,
  expiry_date   TIMESTAMPTZ,
  po_id         TEXT        REFERENCES inbound_pos(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lot_number, sku_id, warehouse_id)
);

CREATE INDEX idx_lots_sku_wh    ON lots (sku_id, warehouse_id);
CREATE INDEX idx_lots_expiry    ON lots (expiry_date) WHERE expiry_date IS NOT NULL;
