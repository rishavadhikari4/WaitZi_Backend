-- MongoDB _id of tables created before the Postgres move. Printed QR stickers
-- encode it, so the public ordering endpoint still accepts it.
ALTER TABLE "dining_tables" ADD COLUMN "legacy_id" TEXT;

CREATE UNIQUE INDEX "dining_tables_legacy_id_key" ON "dining_tables"("legacy_id");
