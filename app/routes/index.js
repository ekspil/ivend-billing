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
        //const {OutSum, InvId, SignatureValue} = request.body

       /* if (!this.robokassaService.validateResultUrl(SignatureValue, OutSum, InvId)) {
            throw new Error("SignatureValidationError")
        }

        const robopaymentStatus = await this.robokassaService.getPayment(InvId)*/


        return reply.type("application/json").code(200).send({message: "Okay"})
    }

    const robokassaSuccessResult = async (request, reply) => {
        console.log("robokassaSuccessResult" + JSON.stringify(request.body))

        /*
                if(!this.robokassaService.validateResultUrl(SignatureValue, OutSum, InvId)) {
                    throw new Error("SignatureValidationError")
                }
        */

        return reply.type("application/json").code(200).send({message: "Okay"})
    }

    const robokassaFailResult = async (request, reply) => {
        console.log("robokassaFailResult" + JSON.stringify(request.body))

        return reply.type("application/json").code(200).send({message: "Okay"})
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

    fastify.post("/api/v1/callback/robokassa/result", robokassaCallback)
    fastify.post("/api/v1/callback/robokassa/result/sucesss", robokassaSuccessResult)
    fastify.post("/api/v1/callback/robokassa/result/fail", robokassaFailResult)


    fastify.setErrorHandler(ErrorHandler)

}

module.exports = Routes
