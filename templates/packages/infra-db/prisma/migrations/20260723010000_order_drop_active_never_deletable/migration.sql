-- An Order is an immutable transactional event — it is NEVER deleted, not even
-- soft-deleted. Its whole lifecycle lives in the OrderStatus machine
-- (creado/verificado/entregado/cancelado), mirroring the append-only
-- StockMovement/ExchangeRate records. Drop the now-meaningless `active` flag.
-- Safe: pre-release owner-locked branch, no production data; nothing legitimate
-- ever set active=false (the only writer was the removed softDelete path).
ALTER TABLE "sales_order" DROP COLUMN "active";
