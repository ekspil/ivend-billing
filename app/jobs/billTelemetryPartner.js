const logger = require("my-custom-logger")
function isSmart(controller){
    if(controller.uid.slice(0, 3) === "400"){
        return true
    }
    if(controller.uid.slice(0, 3) === "500"){
        return true
    }
    return false
}

function billTelemetryPartner({knex}) {
    return async () => {
        return knex.transaction(async (trx) => {

            const partners = await knex("users")
                .transacting(trx)
                .leftJoin("temps", "users.id", "temps.user_id")
                .select("users.id as id", "users.partner_id as partner_id", "temps.amount as balance")
                .where("users.role", "PARTNER")


            for(let partner of partners){
                logger.info(`Starting billing for Partner telemtry at ${new Date()}`)

                const users = await knex("users")
                    .transacting(trx)
                    .leftJoin("temps", "users.id", "temps.user_id")
                    .select("users.id as id", "users.partner_id as partner_id", "temps.amount as balance")
                    .where("users.partner_id", "=", partner.id)

                const statistic = {
                    amount: 0,
                    balance: 0,
                    credit: 0
                }

                users.push(partner)



                let [tariff] = await knex("tariffs")
                    .transacting(trx)
                    .select("telemetry", "acquiring", "smart", "fiscal", "partner_id", "started_at")
                    .where("partner_id",  partner.id)
                    .andWhere("started_at", "<", new Date())
                    .orderBy("id", "desc")
                    .limit(1)

                if(!tariff){
                    tariff = {
                        fiscal: 2000,
                        telemetry: process.env.TELEMETRY_PRICE,
                        acquiring: process.env.TERMINAL_PRICE,
                        smart: process.env.SMART_TERMINAL_PRICE
                    }
                }


                for (const user of users) {
                    const userId = user.id
                    const partnerId = user.partner_id




                    Date.prototype.daysInMonth = function() {
                        return 33 - new Date(this.getFullYear(), this.getMonth(), 33).getDate()
                    }

                    const dayPriceResult = Number((Number(tariff.telemetry) / (new Date().daysInMonth())).toFixed(2))
                    const dayPriceResultSmart = Number((Number(tariff.smart) / (new Date().daysInMonth())).toFixed(2))

                    const terminalDayPriceResult = Number((Number(tariff.acquiring) / (new Date().daysInMonth())).toFixed(2))
                    const fiscalDayPriceResult = Number((Number(tariff.fiscal) / (new Date().daysInMonth())).toFixed(2))

                    const kktOk = await knex
                        .transacting(trx)
                        .select("kkts.user_id as user_id", "kkts.kktActivationDate as kktActivationDate", "kkts.id as kkt_id")
                        .from("kkts")
                        .where("kkts.user_id", userId)
                        .whereNot("kkts.kktActivationDate", "")
                        .whereNot("kkts.type", "orange")
                        .whereNotNull("kkts.kktActivationDate")



                    const controllers = await knex
                        .transacting(trx)
                        .from("controllers")
                        .select("controllers.user_id as user_id",  "controllers.uid as uid", "controllers.status as status", "controllers.id as controller_id", "controllers.sim_card_number as simCardNumber", "controllers.cashless as cashless", "controllers.fiscalization_mode as fiscalizationMode")
                        .where({
                            "controllers.user_id": userId,
                            "controllers.status": "ENABLED"
                        })
                        .whereNull("controllers.deleted_at")



                    const fiscalControllers = controllers.filter(controller => controller.fiscalizationMode !== "NO_FISCAL")
                    const controllerCount = (kktOk.length == 0) ? 0 : Math.max(fiscalControllers.length, (Number(process.env.LOW_FISCAL_COST_LIMIT)* kktOk.length))
                    const dayFiscalPrice = Number((Number(fiscalDayPriceResult) / Number(process.env.LOW_FISCAL_COST_LIMIT)  * controllerCount).toFixed(2))


                    const controllersNoSmart = controllers.filter(controller => !isSmart(controller)).length
                    const controllersSmart = controllers.filter(controller => isSmart(controller)).length
                    const controllersWithSim = controllers.filter(controller => controller.cashless === "ON"  && !isSmart(controller)).length




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
                            const controllerFee = (dayPriceResult * controllersNoSmart + dayPriceResultSmart * controllersSmart) * (Number(feeSettings.controller_fee)/100)
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
                        const controllerFiscalPriceRow = Number((dayFiscalPrice + dayPriceResult * controllersNoSmart + dayPriceResultSmart * controllersSmart  + Number(controllersWithSim) * terminalDayPriceResult).toFixed(2))
                        statistic.amount = Number(statistic.amount) + Number(controllerFiscalPriceRow)
                        let newBalance = Number(user.balance) - Number(controllerFiscalPriceRow)
                        if(newBalance > 0) {
                            statistic.balance = Number(statistic.balance) + Number(newBalance)
                        }
                        else {
                            statistic.credit = Number(statistic.credit) + Number(newBalance)
                        }

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


                        const priceNoControllers = Number((kktOk.length * Number(tariff.fiscal) / (new Date().daysInMonth())).toFixed(2))
                        statistic.amount = Number(statistic.amount) + Number(priceNoControllers)
                        let newBalance = Number(user.balance) - Number(priceNoControllers)
                        if(newBalance > 0) {
                            statistic.balance = Number(statistic.balance) + Number(newBalance)
                        }
                        else {
                            statistic.credit = Number(statistic.credit) + Number(newBalance)
                        }

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


                await knex("admin_statistics")
                    .transacting(trx)
                    .insert({
                        billing_amount: statistic.amount,
                        billing_balance: statistic.balance,
                        billing_credit: statistic.credit,
                        controllers_count: 0,
                        controllers_disabled: 0,
                        controllers_disconnected: 0,
                        kkts_count: 0,
                        kkts_normal: 0,
                        kkts_error: 0,
                        created_at: new Date(),
                        updated_at: new Date()
                    })
            }
        })

    }
}


module.exports = billTelemetryPartner
