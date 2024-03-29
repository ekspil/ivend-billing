const logger = require("my-custom-logger")

function billDailyServices({knex}) {
    return async () => {
        return knex.transaction(async (trx) => {
            logger.info(`Starting checking negative balance job at ${new Date()}`)

            const users = await knex("users")
                .transacting(trx)
                .select("id")
                .whereIn("role", ["VENDOR_NEGATIVE_BALANCE", "VENDOR"])

            for (const user of users) {

                const dateNow = new Date()
                const dateDayAgo = new Date()
                const dateTwoDaysAgo = new Date()
                const dateThreeDaysAgo = new Date()

                dateDayAgo.setDate(dateNow.getDate() - 1)
                dateTwoDaysAgo.setDate(dateNow.getDate() - 2)
                dateThreeDaysAgo.setDate(dateNow.getDate() - 3)

                const balanceNow = await knex("transactions")
                    .sum("amount as balance_now")
                    .where({
                        user_id: user.id,
                    })
                    .first()

                const balanceDayAgo = await knex("transactions")
                    .sum("amount as balance_day_ago")
                    .where({
                        user_id: user.id,
                    })
                    .andWhere("created_at", "<", dateDayAgo)
                    .first()


                // const balanceTwoDaysAgo = await knex("transactions")
                //     .sum("amount as balance_two_days_ago")
                //     .where({
                //         user_id: user.id,
                //     })
                //     .andWhere("created_at", "<", dateTwoDaysAgo)
                //     .first()

                const {balance_now} = balanceNow
                const {balance_day_ago} = balanceDayAgo
                //const {balance_two_days_ago} = balanceTwoDaysAgo

                if (Number(balance_now) < -2000) {
                    logger.info(`-2000 of balance for user #${user.id}, locking`)
                    await knex("users")
                        .transacting(trx)
                        .where({id: user.id})
                        .update({role: "VENDOR_NEGATIVE_BALANCE"})

                        
                    
                }
                if(Number(balance_day_ago) < -100){
                    if (Number(balance_now) > -100) {
                        logger.info(`> -100 of balance for user #${user.id}, unlocking`)
                        await knex("users")
                            .transacting(trx)
                            .where({id: user.id})
                            .update({role: "VENDOR"})



                    }
                }

            }
        })

    }
}



module.exports = billDailyServices
