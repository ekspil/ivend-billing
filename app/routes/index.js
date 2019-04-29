const ErrorHandler = require("./error/ErrorHandler")

function Routes({fastify, knex, robokassaService}) {
    const createPayment = async (request, reply) => {
        const {amount, to, email} = request.body

        const {paymentRequestId} = await robokassaService.requestPayment(to, email, amount)

        return reply.type("application/json").code(200).send({
            paymentRequestId
        })
    }

    const robokassaCallback = async (request, reply) => {
        console.log("robokassaCallback " + JSON.stringify(request.body))

        const {OutSum, InvId, SignatureValue} = request.body
        console.log({OutSum, InvId, SignatureValue})

        if (!robokassaService.verifySignature(OutSum, InvId, SignatureValue)) {
            throw new Error("SignatureValidationError")
        }

        const robopaymentStatus = await robokassaService.getPayment(Number(InvId))

        console.log(robopaymentStatus)

        return reply.type("application/json").code(200).send({message: "Okay"})
    }

    const robokassaSuccessResult = async (request, reply) => {
        //{"inv_id":"9","InvId":"9","out_summ":"10","OutSum":"10","crc":"a173852e25b9b8374a88c0b210335402b472bbc97d9d3b54e31fe39c96022c05","SignatureValue":"a173852e25b9b8374a88c0b210335402b472bbc97d9d3b54e31fe39c96022c05","Culture":"ru","IsTest":"1"}
        return reply.redirect(302, `${process.env.FRONTEND_URL}/billing?from=robokassa&paid=true`)
    }

    const robokassaFailResult = async (request, reply) => {
        //{"inv_id":"8","InvId":"8","out_summ":"10","OutSum":"10","Culture":"ru","IsTest":"1"}
        return reply.redirect(302, `${process.env.FRONTEND_URL}/billing?from=robokassa&paid=false`)
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

    fastify.register(require("fastify-formbody"))

    fastify.post("/api/v1/billing/createPayment", createPayment)
    fastify.get("/api/v1/status", status)
    fastify.get("/api/v1/service/:service/price/daily", servicePriceDaily)

    fastify.post("/api/v1/callback/robokassa", robokassaCallback)
    fastify.post("/api/v1/callback/robokassa/sucesss", robokassaSuccessResult)
    fastify.post("/api/v1/callback/robokassa/fail", robokassaFailResult)


    fastify.setErrorHandler(ErrorHandler)

}

module.exports = Routes
