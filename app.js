require("dotenv").config()
const logger = require("my-custom-logger")

const RobokassaService = require("./app/service/RobokassaService")
const scheduler = require("./app/utils/scheduler")

const knex = require("knex")({
    client: "pg",
    connection: {
        host: process.env.POSTGRES_HOST,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB,
        port: process.env.POSTGRES_PORT,
        ssl: false
    }
})

const robokassaService = new RobokassaService({knex})
const fastify = require("fastify")({})

const Routes = require("./app/routes")
Routes({fastify, knex, robokassaService})

scheduler.scheduleTasks({knex})

const port = 3500

fastify.listen(port, "0.0.0.0", (err) => {
    logger.info("iVend billing service started on port " + port)
    if (err) throw err
})

