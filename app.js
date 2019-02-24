if (!process.env.YANDEX_SHOP_ID || !process.env.YANDEX_SECRET_KEY) {
    throw new Error("YANDEX_SHOP_ID or YANDEX_SECRET_KEY env is not set")
}

const YandexKassaService = require("./app/service/YandexKassaService")
const scheduler = require("./app/utils/scheduler")

const knex = require("knex")({
    client: "pg",
    connection: {
        host: process.env.POSTGRES_HOST,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB
    }
})

const yandexKassaService = new YandexKassaService()


const fastify = require("fastify")({
    logger: true
})

const Routes = require("./app/routes")
Routes({fastify, knex, yandexKassaService})

scheduler.scheduleTasks({knex, yandexKassaService})

fastify.listen(3500, (err, address) => {
    if (err) throw err
})

