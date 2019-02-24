if (!process.env.YANDEX_SHOP_ID || !process.env.YANDEX_SECRET_KEY) {
    throw new Error("YANDEX_SHOP_ID or YANDEX_SECRET_KEY env is not set")
}

const YandexKassaService = require("./app/service/YandexKassaService")
const scheduler = require("./app/utils/scheduler")

const knex = require("knex")({
    client: "pg",
    connection: {
        host: "127.0.0.1",
        user: "ivend",
        password: "ivend",
        database: "ivend"
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

