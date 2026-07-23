-- Defense-in-depth DB invariant (SDD follow-up W4): `reserved` can never
-- exceed `on_hand`. This complements the existing
-- `stock_level_non_negative_check` (on_hand >= 0 AND reserved >= 0).
--
-- An IMMEDIATE (non-deferrable) CHECK — evaluated on EVERY row modification,
-- not at COMMIT. This is what makes `PrismaOrderRepository.deliver`'s
-- release-before-sale_out ordering LOAD-BEARING and observable: reversing it
-- would drive the intermediate row state to `on_hand < reserved` and be
-- rejected mid-transaction. It also hardens the generic stock-movement
-- endpoint — an out-movement (e.g. adjustment_out) that would remove
-- physically-reserved stock is now refused instead of silently corrupting the
-- invariant.
ALTER TABLE "stock_level"
  ADD CONSTRAINT "stock_level_reserved_le_on_hand_check" CHECK ("reserved" <= "on_hand");
