require("dotenv").config()

const RobokassaService = require("./app/service/RobokassaService")
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

const robokassaService = new RobokassaService({knex})


const fastify = require("fastify")({})

const Routes = require("./app/routes")
Routes({fastify, knex, robokassaService})

scheduler.scheduleTasks({knex})

fastify.listen(3500, "0.0.0.0", (err) => {
    console.log("Server started on port 3500")
    if (err) throw err
})

