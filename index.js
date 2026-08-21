import sqlite3 from "sqlite3-offline-next";
import { open } from 'sqlite'

open({
    filename: "./dados/banco.db",
    driver: sqlite3.Database
}).then(async (db) => {
    const val = await db.all("select titulo from teses;")
    console.log(val);
})