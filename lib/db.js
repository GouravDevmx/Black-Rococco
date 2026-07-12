const store = require('./store');
const { migrateDb } = require('./migrate');
const { DB_PATH } = require('./config');

async function readDb(salonId) {
  return migrateDb(await store.readDb(salonId, DB_PATH));
}

async function writeDb(db, salonId) {
  await store.writeDb(db, salonId, DB_PATH);
}

module.exports = {
  readDb,
  writeDb,
  insertAppointmentAtomic: store.insertAppointmentAtomic,
  upsertClientAndGetId: store.upsertClientAndGetId
};
