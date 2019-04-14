if (!process.env.YANDEX_SHOP_ID || !process.env.YANDEX_SECRET_KEY || !process.env.YANDEX_KASSA_RETURN_URL) {
    throw new Error("YANDEX_SHOP_ID or YANDEX_SECRET_KEY or YANDEX_KASSA_RETURN_URL env is not set")
}

const YandexKassaService = require("./app/service/YandexKassaService")
const scheduler = require("./app/utils/scheduler")

const knex = require("knex")({
    client: "pg",
    connection: {
        host: process.env.POSTGRES_HOST,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB,
        ssl: true
    }
})

const yandexKassaService = new YandexKassaService()


const fastify = require("fastify")({})

const Routes = require("./app/routes")
Routes({fastify, knex, yandexKassaService})

scheduler.scheduleTasks({knex, yandexKassaService})

fastify.listen(3500, "0.0.0.0", (err) => {
    console.log("Server started on port 3500")
    if (err) throw err
})

