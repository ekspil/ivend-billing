const ErrorHandler = require("./error/ErrorHandler")
const PaymentStatus = require("../enums/PaymentStatus")

function Routes({fastify, knex, robokassaService}) {
    const createPayment = async (request, reply) => {
        const {amount, phone, userId, email} = request.body

        const {paymentRequestId} = await robokassaService.requestPayment({userId, phone, email, amount})

        return reply.type("application/json").code(200).send({
            paymentRequestId
        })
    }

    const robokassaCallback = async (request, reply) => {
        const {OutSum, InvId, SignatureValue} = request.body

        if (!robokassaService.verifySignature(OutSum, InvId, SignatureValue)) {
            throw new Error("SignatureValidationError")
        }

        await knex.transaction(async (trx) => {
            const paymentRequest = await knex("payment_requests").where({payment_id: InvId}).transacting(trx).first()

            if (!paymentRequest) {
                throw new Error("PaymentRequestNotFound")
            }

            if(paymentRequest.status !== PaymentStatus.PENDING) {
                throw new Error("PaymentRequestAlreadyProcessed")
            }

            const deposit = await knex("deposits").where({payment_request_id: paymentRequest.id}).transacting(trx).first()

            if (!deposit) {
                throw new Error("DepositNotFound")
            }

            console.log("Robokassa approved payment for ${paymentRequest.to}, amount ${deposit.amount}")

            await knex("transactions")
                .transacting(trx)
                .insert({
                    amount: deposit.amount,
                    user_id: deposit.user_id,
                    meta: `deposit_${deposit.id}`,
                    created_at: new Date(),
                    updated_at: new Date()
                })

            await knex("payment_requests")
                .where({payment_id: Number(InvId)})
                .update({status: PaymentStatus.SUCCEEDED})
                .transacting(trx)
        })

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
        const {service, userId} = request.params

        if (service !== "TELEMETRY") {
            return reply.type("application/json").code(404).send({message: "Not found"})
        }

        const [dayPriceResult] = (await knex
            .raw("SELECT ROUND(:price::NUMERIC / (SELECT DATE_PART('days',  DATE_TRUNC('month', NOW())  + '1 MONTH'::INTERVAL  - '1 DAY'::INTERVAL))::numeric, 2) as day_price", {
                price: Number(process.env.TELEMETRY_PRICE),
            })).rows

        const kkts = await knex
            .select("kkts.user_id as user_id", "kkts.kktActivationDate as kktActivationDate", "kkts.id as kkt_id")
            .from("kkts")
            .leftJoin("users", "kkts.user_id", "users.id")
            .where("kkts.user_id", userId)
            .groupBy("kkts.id", "kkts.user_id")

        const [kktOk] = kkts.filter(kkt => kkt.kktActivationDate)

        const controllers = await knex
            .select("controllers.user_id as user_id", "controllers.status as status", "controllers.id as controller_id", "controllers.fiscalization_mode as fiscalizationMode")
            .from("controllers")
            .leftJoin("users", "controllers.user_id", "users.id")
            .where("controllers.user_id", userId)
            .where({
                "controllers.user_id": userId,
                "controllers.status": "ENABLED",
                "users.role": "VENDOR"
            })
            .groupBy("controllers.id", "controllers.user_id")

        const fiscalControllers = controllers.filter(controller => controller.fiscalizationMode !== "NO_FISCAL")


        const controllerCount = (!kktOk) ? 0 : Math.max(fiscalControllers.length, Number(process.env.LOW_FISCAL_COST_LIMIT))
        const dayFiscalPriceRow = await knex("controllers")
            .first(knex.raw("ROUND(:price::NUMERIC * :controllerCount::numeric, 2) as day_fiscal_price", {
                price: dayPriceResult.day_price,
                controllerCount
            }))


        const dayFiscalPrice = dayFiscalPriceRow.day_fiscal_price
        const controllerFiscalPriceRow = await knex("controllers")
            .first(knex.raw("ROUND(:dayFiscalPrice::NUMERIC / :controllersLength::numeric + :dayPrice::numeric, 2) as day_price", {
                dayFiscalPrice,
                controllersLength: controllers.length,
                dayPrice: dayPriceResult.day_price
            }))
        const dayPrice = controllerFiscalPriceRow.day_price

        reply.type("application/json").code(200)
        return {price: Number(dayPrice)}
    }

    fastify.register(require("fastify-formbody"))

    fastify.post("/api/v1/billing/createPayment", createPayment)
    fastify.get("/api/v1/status", status)
    fastify.get("/api/v1/service/:service/price/daily/:userId", servicePriceDaily)

    fastify.post("/api/v1/callback/robokassa", robokassaCallback)
    fastify.post("/api/v1/callback/robokassa/sucesss", robokassaSuccessResult)
    fastify.post("/api/v1/callback/robokassa/fail", robokassaFailResult)


    fastify.setErrorHandler(ErrorHandler)

}

module.exports = Routes
