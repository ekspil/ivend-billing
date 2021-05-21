const ErrorHandler = require("./error/ErrorHandler")
const PaymentStatus = require("../enums/PaymentStatus")
const logger = require("my-custom-logger")

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

            logger.info("Robokassa approved payment for ${paymentRequest.to}, amount ${deposit.amount}")

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


    const changeUserBalance = async (request, reply) => {

        const {sum, userId} = request.params

        await knex.transaction(async (trx) => {
            const [TrId] = await knex("transactions")
                .transacting(trx)
                .returning("id")
                .insert({
                    amount: sum,
                    user_id: userId,
                    meta: `admin_change_balance_user_id_${userId}_sum_${sum}`,
                    created_at: new Date(),
                    updated_at: new Date()
                })

            const [paymentRequestId] = await knex("payment_requests")
                .transacting(trx)
                .returning("id")
                .insert({
                    payment_id: "ADMIN-CH-B-" + TrId,
                    redirect_url: "ADMIN-CH-B-" + TrId,
                    status: PaymentStatus.ADMIN_EDIT,
                    to: "none",
                    created_at: new Date(),
                    updated_at: new Date()
                })

            reply.type("application/json").code(200).send({
                paymentRequestId
            })

        })

        return {balance: true}
    }

    const servicePriceDaily = async (request, reply) => {
        Date.prototype.daysInMonth = function() {
            return 33 - new Date(this.getFullYear(), this.getMonth(), 33).getDate()
        }

        const {service, userId} = request.params

        if (service !== "TELEMETRY") {
            return reply.type("application/json").code(404).send({message: "Not found"})
        }

        const dayPriceResult = Number((Number(process.env.TELEMETRY_PRICE) / (new Date().daysInMonth())).toFixed(2))

        const terminalDayPriceResult = Number((Number(process.env.TERMINAL_PRICE) / (new Date().daysInMonth())).toFixed(2))


        const kktOk = await knex
            .select("kkts.user_id as user_id", "kkts.kktActivationDate as kktActivationDate", "kkts.id as kkt_id")
            .from("kkts")
            .where("kkts.user_id", userId)
            .whereNot("kkts.kktActivationDate", "")
            .whereNotNull("kkts.kktActivationDate")



        const controllers = await knex
            .from("controllers")
            .select("controllers.user_id as user_id", "controllers.status as status", "controllers.id as controller_id", "controllers.sim_card_number as simCardNumber", "controllers.cashless as cashless", "controllers.fiscalization_mode as fiscalizationMode")
            .where({
                "controllers.user_id": userId,
                "controllers.status": "ENABLED"
            })
            .whereNull("controllers.deleted_at")

        const fiscalControllers = controllers.filter(controller => controller.fiscalizationMode !== "NO_FISCAL")
        const controllerCount = (kktOk.length == 0) ? 0 : Math.max(fiscalControllers.length, (Number(process.env.LOW_FISCAL_COST_LIMIT)* kktOk.length))
        const dayFiscalPrice = Number((Number(dayPriceResult) * controllerCount).toFixed(2))



        const controllersWithSim = controllers.filter(controller => controller.simCardNumber && controller.simCardNumber !== "0" && controller.cashless === "ON" && controller.simCardNumber !== "false").length


        if(controllers.length > 0){
            const controllerFiscalPriceRow = Number((dayFiscalPrice + dayPriceResult * controllers.length + Number(controllersWithSim) * terminalDayPriceResult).toFixed(2))
            reply.type("application/json").code(200)
            return {price: controllerFiscalPriceRow}

        } else {


            reply.type("application/json").code(200)
            return {price: Number((kktOk.length * 2000 / (new Date().daysInMonth())).toFixed(2))}

        }



    }

    fastify.register(require("fastify-formbody"))

    fastify.post("/api/v1/billing/createPayment", createPayment)
    fastify.get("/api/v1/status", status)
    fastify.get("/api/v1/service/:service/price/daily/:userId", servicePriceDaily)
    fastify.get("/api/v1/service/balance/change/:userId/:sum", changeUserBalance)

    fastify.post("/api/v1/callback/robokassa", robokassaCallback)
    fastify.post("/api/v1/callback/robokassa/sucesss", robokassaSuccessResult)
    fastify.post("/api/v1/callback/robokassa/fail", robokassaFailResult)


    fastify.setErrorHandler(ErrorHandler)

}

module.exports = Routes

