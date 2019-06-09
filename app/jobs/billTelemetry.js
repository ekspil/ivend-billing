function billTelemetry({knex}) {
    return async () => {
        return knex.transaction(async (trx) => {
            console.log(`Starting billing for telemtry at ${new Date()}`)

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

                const kkts = await knex
                    .transacting(trx)
                    .select("kkts.user_id as user_id", "kkts.kktActivationDate as kktActivationDate", "kkts.id as kkt_id")
                    .from("kkts")
                    .leftJoin("users", "kkts.user_id", "users.id")
                    .where("kkts.user_id", userId)
                    .groupBy("kkts.id", "kkts.user_id")

                const [kktOk] = kkts.filter(kkt => kkt.kktActivationDate)

                const controllers = await knex
                    .transacting(trx)
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


                const controllerCount = (!kktOk) ? 0 : (fiscalControllers.length > Number(process.env.LOW_FISCAL_COST_LIMIT)) ? fiscalControllers.length : Number(process.env.LOW_FISCAL_COST_LIMIT)
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
                    const controllerFiscalPriceRow = await knex("controllers")
                        .first(knex.raw("ROUND(:dayFiscalPrice::NUMERIC / :controllersLength::numeric + :dayPrice::numeric, 2) as day_price", {
                            dayFiscalPrice,
                            controllersLength: controllers.length,
                            dayPrice: dayPriceResult.day_price
                        }))
                        .transacting(trx)
                    const dayPrice = controllerFiscalPriceRow.day_price

                    console.log(`Bill the User #${userId} for telemetry [ControllerID ${controller.controller_id}] for ${dayPrice} RUB`)

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
            }
        })

    }
}


module.exports = billTelemetry
