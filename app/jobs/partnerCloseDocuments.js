const logger = require("my-custom-logger")

function createCloseDocuments({knex}) {
    return async () => {
        return knex.transaction(async (trx) => {

            const partners =await knex("users")
                .transacting(trx)
                .leftJoin("temps", "users.id", "temps.user_id")
                .select("users.id as id", "users.partner_id as partner_id", "temps.amount as balance")
                .where("users.role", "PARTNER")


            const month = new Date().getUTCMonth()
            const year = new Date().getUTCFullYear()




            const to = new Date()
            to.setUTCFullYear(year)
            to.setUTCMonth(month)
            to.setUTCDate(0)
            to.setUTCHours(23)
            to.setUTCMinutes(59)
            to.setUTCSeconds(59)
            const from = new Date()
            from.setUTCFullYear(year)
            from.setUTCMonth(month -1)
            from.setUTCDate(1)
            from.setUTCHours(0)
            from.setUTCMinutes(0)
            from.setUTCSeconds(0)


            for(let partner of partners){
                logger.info(`Starting billing for Partner telemtry at ${new Date()}`)




                const fees = await knex("partner_fees")
                    .transacting(trx)
                    .select("controller_fee", "terminal_fee", "kkm_fee", "user_id", "partner_id", "created_at", "status")
                    .where("partner_id", partner.id)
                    .andWhere("created_at", "<", to)
                    .andWhere(function (builder) {
                        builder
                            .whereNull("status")
                            .orWhere("status", "SUCCESS")
                        
                    })
                    
                    

                if(!fees || fees.length === 0) continue

                const amount = fees.reduce((acc, item) => {
                    return (acc + Number(item.controller_fee) + Number(item.terminal_fee) + Number(item.kkm_fee))
                }, 0)

                if(amount < 1000) continue



                await knex("partner_fees")
                    .transacting(trx)
                    .insert({
                        controller_fee: -amount,
                        terminal_fee: 0,
                        kkm_fee: 0,
                        user_id: partner.id,
                        status: "WAITING",
                        partner_id: partner.id,
                        created_at: new Date(),
                        updated_at: new Date()
                    })
            }




        }
        )}
        
}


module.exports = createCloseDocuments
