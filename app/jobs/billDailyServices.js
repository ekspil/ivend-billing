function billDailyServices({knex}) {
    return async () => {
        return knex.transaction(async (trx) => {
            console.log(`Starting billServices job at ${new Date()}`)

            const users = await knex("users")
                .transacting(trx)
                .select("id")
                .where("role", "USER")

            for (const user of users) {
                const userId = user.id

                const services = await knex("controller_services")
                    .transacting(trx)
                    .count("services.id as serviceCount")
                    .select("price", "controllers.user_id", "services.id", "services.name", "controllers.id as controller_id")
                    .leftJoin("controllers", "controller_services.controller_id", "controllers.id")
                    .leftJoin("services", "controller_services.service_id", "services.id")
                    .leftJoin("users", "controllers.user_id", "users.id")
                    .where("controllers.user_id", userId)
                    .where({
                        "controllers.user_id": userId,
                        "services.billingType": "DAILY"
                    })
                    .groupBy("controllers.user_id", "services.id", "controller_services.id", "controllers.id")

                // Get his balance
                for (const service of services) {
                    console.log(`Bill the User #${userId} for service #${service.id} [${service.name}, ControllerID ${service.controller_id}] for ${service.price} RUB`)
                    await knex("transactions")
                        .transacting(trx)
                        .insert({
                            amount: -service.price,
                            user_id: service.user_id,
                            meta: `${service.name.toLowerCase()}_${service.id}_${service.controller_id}`,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        })
                }
            }
        })

    }
}


module.exports = billDailyServices
