const uuidv4 = require("uuid/v4")
const ErrorHandler = require("./error/ErrorHandler")

function Routes({fastify, knex, yandexKassaService}) {

    const createPayment = async (request, reply) => {
        const idempotenceKey = uuidv4()

        const {amount, to} = request.body

        const payment = await yandexKassaService.requestPayment(amount, idempotenceKey)
        const {confirmation_url} = payment.confirmation
        const {id, status} = payment


        const [paymentRequestId] = await knex("payment_requests")
            .returning("id")
            .insert({
                payment_id: id,
                idempotence_key: idempotenceKey,
                redirect_url: confirmation_url,
                status,
                to,
                created_at: new Date(),
                updated_at: new Date()
            })


        reply.type("application/json").code(200)
        return {
            paymentRequestId
        }

    }

    const status = async (request, reply) => {
        reply.type("application/json").code(200)
        return {health: "OK"}
    }

    const servicePriceDaily = async (request, reply) => {
        const {service} = request.params

        if (service !== "TELEMETRY") {
            return reply.type("application/json").code(404).send({message: "Not found"})
        }

        const [dayPriceResult] = (await knex
            .raw("SELECT ROUND(:price::NUMERIC / (SELECT DATE_PART('days',  DATE_TRUNC('month', NOW())  + '1 MONTH'::INTERVAL  - '1 DAY'::INTERVAL))::numeric, 2) as day_price", {
                price: Number(process.env.TELEMETRY_PRICE),
            })).rows

        const dayPrice = dayPriceResult.day_price

        reply.type("application/json").code(200)
        return {price: Number(dayPrice)}
    }

    fastify.post("/api/v1/billing/createPayment", createPayment)
    fastify.get("/api/v1/status", status)
    fastify.get("/api/v1/service/:service/price/daily", servicePriceDaily)

    fastify.setErrorHandler(ErrorHandler)

}

module.exports = Routes
