const uuidv4 = require("uuid/v4")

function Routes({fastify, knex, yandexKassaService}) {

    const createPayment = async (request, reply) => {
        const idempotenceKey = uuidv4()

        const {amount, to} = request.body

        try {
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

        } catch (e) {
            console.error(e)
            console.error(e.stack)
            reply.type("application/json").code(500)
            return {}
        }
    }

    const status = async (request, reply) => {
        reply.type("application/json").code(200)
        return {health: "OK"}
    }

    const servicePriceDaily = async (request, reply) => {
        try {
            const {service} = request.params

            if (service !== "TELEMETRY") {
                return reply.type("application/json").code(404).send({message: "Not found"})
            }

            const [dayPriceResult] = (await knex
                .raw("SELECT ROUND(:price::NUMERIC / (SELECT DATE_PART('days',  DATE_TRUNC('month', NOW())  + '1 MONTH'::INTERVAL  - '1 DAY'::INTERVAL))::numeric, 2) as day_price", {
                    price: process.env.TELEMETRY_PRICE,
                })).rows

            const dayPrice = dayPriceResult.day_price

            reply.type("application/json").code(200)
            return {price: Number(dayPrice)}
        } catch (e) {
            console.error(e)
            console.error(e.stack)
            reply.type("application/json").code(500)
            return {}
        }
    }

    fastify.post("/api/v1/billing/createPayment", createPayment)
    fastify.get("/api/v1/status", status)
    fastify.get("/api/v1/service/:service/price/daily", servicePriceDaily)

}

module.exports = Routes
