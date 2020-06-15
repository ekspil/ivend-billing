const logger = require("my-custom-logger")

function billTelemetry({knex}) {
    return async () => {
        return knex.transaction(async (trx) => {
            logger.info(`Starting billing for telemtry at ${new Date()}`)

            const users = await knex("users")
                .transacting(trx)
                .select("id")
                .where("role", "VENDOR")

            for (const user of users) {
                const userId = user.id

                const [dayPriceResult] = (await knex
                    .raw("SELECT ROUND(:price::NUMERIC / (SELECT DATE_PART('days',  DATE_TRUNC('month', NOW())  + '1 MONTH'::INTERVAL  - '1 DAY'::INTERVAL))::numeric, 2) as day_price, controllers.user_id, controllers.status, controllers.id FROM controllers", {
                        price: process.env.TELEMETRY_PRICE,
                    })
                    .transacting(trx)).rows


                const [terminalDayPriceResult] = (await knex
                    .raw("SELECT ROUND(:price::NUMERIC / (SELECT DATE_PART('days',  DATE_TRUNC('month', NOW())  + '1 MONTH'::INTERVAL  - '1 DAY'::INTERVAL))::numeric, 2) as day_price", {
                        price: Number(process.env.TERMINAL_PRICE),
                    })).rows


                const kkts = await knex
                    .transacting(trx)
                    .select("kkts.user_id as user_id", "kkts.kktActivationDate as kktActivationDate", "kkts.id as kkt_id")
                    .from("kkts")
                    .leftJoin("users", "kkts.user_id", "users.id")
                    .where("kkts.user_id", userId)
                    .groupBy("kkts.id", "kkts.user_id")

                const kktOk = kkts.filter(kkt => kkt.kktActivationDate)

                const controllers = await knex
                    .transacting(trx)
                    .from("controllers")
                    .leftJoin("users", "controllers.user_id", "users.id")
                    .join("machines", "controllers.id", "machines.controller_id")
                    .select("controllers.user_id as user_id", "controllers.status as status", "controllers.sim_card_number as simCardNumber",  "controllers.id as controller_id", "controllers.fiscalization_mode as fiscalizationMode", "machines.id as machine_id")
                    .where("controllers.user_id", userId)
                    .where({
                        "controllers.user_id": userId,
                        "controllers.status": "ENABLED",
                        "users.role": "VENDOR"
                    })
                    .whereNull("controllers.deleted_at")
                    .groupBy("controllers.id", "controllers.user_id", "machines.id")

                const fiscalControllers = controllers.filter(controller => controller.fiscalizationMode !== "NO_FISCAL")



                const controllerCount = (kktOk.length == 0) ? 0 : Math.max(fiscalControllers.length, (Number(process.env.LOW_FISCAL_COST_LIMIT)* kktOk.length))
                const dayFiscalPriceRow = await knex("controllers")
                    .first(knex.raw("ROUND(:price::NUMERIC * :controllerCount::numeric, 2) as day_fiscal_price", {
                        price: dayPriceResult.day_price,
                        controllerCount
                    }))
                    .transacting(trx)
                const dayFiscalPrice = dayFiscalPriceRow.day_fiscal_price


                for (const controller of controllers) {
                    //counting price
                    // Price / DaysInMonth
                    const firstSale = await knex
                        .transacting(trx)
                        .from("sales")
                        .first("id", "price")
                        .where("machine_id", controller.machine_id)

                    if(!firstSale) continue


                    let terminal = 0
                    if(controller.simCardNumber && controller.simCardNumber !== "0" && controller.simCardNumber !== "false"){
                        terminal = 1
                    }
                    const controllerFiscalPriceRow = await knex("controllers")
                        .first(knex.raw("ROUND(:dayFiscalPrice::NUMERIC / :controllersLength::numeric + :dayPrice::numeric + :terminalPrice::numeric * :terminal::numeric, 2) as day_price", {
                            dayFiscalPrice,
                            controllersLength: controllers.length,
                            dayPrice: dayPriceResult.day_price,
                            terminalPrice: Number(terminalDayPriceResult.day_price),
                            terminal
                        }))
                        .transacting(trx)
                    const dayPrice = controllerFiscalPriceRow.day_price

                    logger.info(`Bill the User #${userId} for telemetry [ControllerID ${controller.controller_id}] for ${dayPrice} RUB`)

                    await knex("transactions")
                        .transacting(trx)
                        .insert({
                            amount: -dayPrice,
                            user_id: controller.user_id,
                            meta: `telemetry_${controller.controller_id}`,
                            created_at: new Date(),
                            updated_at: new Date()
                        })
                }

                if (controllers.length === 0) {
                    Date.prototype.daysInMonth = function() {
                        return 33 - new Date(this.getFullYear(), this.getMonth(), 33).getDate()
                    }


                    await knex("transactions")
                        .transacting(trx)
                        .insert({
                            amount: Number(-(kktOk.length * 2000 / (new Date().daysInMonth()))),
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
