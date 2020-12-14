const logger = require("my-custom-logger")

function billTelemetry({knex}) {
    return async () => {
        return knex.transaction(async (trx) => {
            logger.info(`Starting billing for telemtry at ${new Date()}`)

            const users = await knex("users")
                .transacting(trx)
                .select("id", "partner_id")
                .whereNot("role", "ADMIN")

            for (const user of users) {
                const userId = user.id
                const partnerId = user.partner_id


                Date.prototype.daysInMonth = function() {
                    return 33 - new Date(this.getFullYear(), this.getMonth(), 33).getDate()
                }

                const dayPriceResult = Number((Number(process.env.TELEMETRY_PRICE) / (new Date().daysInMonth())).toFixed(2))

                const terminalDayPriceResult = Number((Number(process.env.TERMINAL_PRICE) / (new Date().daysInMonth())).toFixed(2))


                const kktOk = await knex
                    .transacting(trx)
                    .select("kkts.user_id as user_id", "kkts.kktActivationDate as kktActivationDate", "kkts.id as kkt_id")
                    .from("kkts")
                    .where("kkts.user_id", userId)
                    .whereNot("kkts.kktActivationDate", "")
                    .whereNotNull("kkts.kktActivationDate")



                const controllers = await knex
                    .transacting(trx)
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




                let feeSettings = null
                if(partnerId){

                    [feeSettings] = await knex
                        .transacting(trx)
                        .from("partner_settings")
                        .select("user_id", "controller_fee", "terminal_fee", "kkm_fee")
                        .where({
                            "user_id": partnerId
                        })
                    if(feeSettings){
                        const controllerFee = (dayPriceResult * controllers.length) * (Number(feeSettings.controller_fee)/100)
                        const terminalFee = (Number(controllersWithSim) * terminalDayPriceResult) * (Number(feeSettings.terminal_fee)/100)
                        const kkmFee = Number(dayFiscalPrice) * (Number(feeSettings.kkm_fee)/100)


                        await knex("partner_fees")
                            .transacting(trx)
                            .insert({
                                controller_fee: controllerFee,
                                terminal_fee: terminalFee,
                                kkm_fee: kkmFee,
                                user_id: userId,
                                partner_id: partnerId,
                                created_at: new Date(),
                                updated_at: new Date()
                            })
                    }

                }


                if(controllers.length > 0){
                    const controllerFiscalPriceRow = Number((dayFiscalPrice + dayPriceResult * controllers.length + Number(controllersWithSim) * terminalDayPriceResult).toFixed(2))

                    await knex("transactions")
                        .transacting(trx)
                        .insert({
                            amount: -controllerFiscalPriceRow,
                            user_id: user.id,
                            meta: `telemetry_USER_${user.id}`,
                            created_at: new Date(),
                            updated_at: new Date()
                        })

                } else {


                    const priceNoControllers = Number((kktOk.length * 2000 / (new Date().daysInMonth())).toFixed(2))

                    await knex("transactions")
                        .transacting(trx)
                        .insert({
                            amount: -priceNoControllers,
                            user_id: user.id,
                            meta: `telemetry_NO_CONTROLLERS_USER_${user.id}`,
                            created_at: new Date(),
                            updated_at: new Date()
                        })
                }

            }
        })

    }
}


module.exports = billTelemetry
