-- A cashier may have at most one open till session.
--
-- ensureOpenShift looks for an open shift and creates one if absent; two payments taken
-- at the same moment (a double-click on "Take payment") both saw none and each opened a
-- session, splitting one drawer across two Z-reads. A partial unique index makes the
-- database the arbiter, so the loser of the race fails and re-reads instead.
--
-- Close any duplicates already present before the constraint is applied, keeping the
-- earliest open session per cashier and moving later payments onto it.
WITH ranked AS (
  SELECT id, "cashierId",
         ROW_NUMBER() OVER (PARTITION BY "cashierId" ORDER BY "openedAt") AS rn,
         FIRST_VALUE(id) OVER (PARTITION BY "cashierId" ORDER BY "openedAt") AS keep_id
  FROM cashier_shifts
  WHERE "closedAt" IS NULL
)
UPDATE payments p
SET "shiftId" = r.keep_id
FROM ranked r
WHERE p."shiftId" = r.id AND r.rn > 1;

DELETE FROM cashier_shifts
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY "cashierId" ORDER BY "openedAt") AS rn
    FROM cashier_shifts WHERE "closedAt" IS NULL
  ) d WHERE d.rn > 1
);

CREATE UNIQUE INDEX "cashier_shifts_one_open_per_cashier"
  ON "cashier_shifts" ("cashierId")
  WHERE "closedAt" IS NULL;
