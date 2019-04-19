const TELEMETRY_PRICE = 100

function billTelemetry({knex}) {
    return async () => {
        return knex.transaction(async (trx) => {
            console.log(`Starting billing for telemtry at ${new Date()}`)

            const users = await knex("users")
                .transacting(trx)
                .select("id")
                .where("role", "USER")

            for (const user of users) {
                const userId = user.id

                const [dayPriceResult] = (await knex
                    .raw("SELECT ROUND(:price::NUMERIC / (SELECT DATE_PART('days',  DATE_TRUNC('month', NOW())  + '1 MONTH'::INTERVAL  - '1 DAY'::INTERVAL))::numeric, 2) as day_price, controllers.user_id, controllers.status, controllers.id FROM controllers", {
                        price: TELEMETRY_PRICE,
                    })
                    .transacting(trx)).rows

                const controllers = await knex
                    .transacting(trx)
                    .select("controllers.user_id as user_id", "controllers.status as status", "controllers.id as controller_id")
                    .from("controllers")
                    .leftJoin("users", "controllers.user_id", "users.id")
                    .where("controllers.user_id", userId)
                    .where({
                        "controllers.user_id": userId,
                        "controllers.status": "ENABLED",
                        "users.role": "USER"
                    })
                    .groupBy("controllers.id", "controllers.user_id")

                for (const controller of controllers) {
                    //counting price
                    // Price / DaysInMonth
                    const dayPrice = dayPriceResult.day_price

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
