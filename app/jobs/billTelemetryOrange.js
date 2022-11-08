const logger = require("my-custom-logger")

function billTelemetryOrange({knex}) {
    return async () => {
        return knex.transaction(async (trx) => {
            logger.info(`Starting_orange_billing at ${new Date()}`)

            const kkts = await knex("kkts")
                .transacting(trx)
                .select("id", "user_id")
                .whereIn("type", ["orange"])

            const tariff = {
                fiscal_one: Number(process.env.ORANGE_PRICE)
            }

            let day = new Date().getUTCDate()
            const month = new Date().getUTCMonth()
            const year = new Date().getUTCFullYear()

            const from = new Date()
            from.setUTCFullYear(year)
            from.setUTCMonth(month)
            from.setUTCDate(day -1)
            from.setUTCHours(0)
            from.setUTCMinutes(0)
            from.setUTCSeconds(0)

            const to = new Date()
            to.setUTCFullYear(year)
            to.setUTCMonth(month)
            to.setUTCDate(day -1)
            to.setUTCHours(23)
            to.setUTCMinutes(59)
            to.setUTCSeconds(59)




            for (const kkt of kkts) {


                const sales = await knex
                    .transacting(trx)
                    .from("sales")
                    .select("id")
                    .where({
                        "kkt_id": kkt.id
                    })
                    .andWhere("created_at", ">=", from)
                    .andWhere("created_at", "<=", to)
                    .whereNotNull("receipt_id")

                const amount = Number(tariff.fiscal_one) * sales.length
                if(amount === 0) continue




                await knex("transactions")
                    .transacting(trx)
                    .insert({
                        amount: -amount,
                        user_id: kkt.user_id,
                        meta: `orange_fiscal_billing_USER_${kkt.user_id}`,
                        created_at: new Date(),
                        updated_at: new Date()
                    })



            }

        })


    }
}


module.exports = billTelemetryOrange
