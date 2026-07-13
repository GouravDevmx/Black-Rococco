const store = require('./store');
const { migrateDb } = require('./migrate');
const { DB_PATH } = require('./config');

async function readDb(salonId) {
  const db = migrateDb(await store.readDb(salonId, DB_PATH));
  // Baseline AFTER migration, so migrate.js's normalizations aren't mistaken
  // for real user changes by the record-level diff in writeDb().
  if (salonId) store.takeSnapshot(db);
  return db;
}

async function writeDb(db, salonId) {
  await store.writeDb(db, salonId, DB_PATH);
}

module.exports = {
  readDb,
  writeDb,
  insertAppointmentAtomic: store.insertAppointmentAtomic,
  upsertClientAndGetId: store.upsertClientAndGetId,
  // Folds an out-of-band-persisted record into the read snapshot so the
  // record-level diff in writeDb() doesn't try to INSERT it a second time.
  markPersisted: store.markPersisted
};
