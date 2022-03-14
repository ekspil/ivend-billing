
function updateFastSales({knex}) {
    return async () => {
        return knex.transaction(async (trx) => {
            const day = new Date().getUTCDate()
            const month = new Date().getUTCMonth()
            const year = new Date().getUTCFullYear()



            let hour = 24 - new Date().getUTCHours()
            if(hour === 24) hour = 0
            const time_zone = String(hour)

            const to = new Date()
            to.setUTCFullYear(year)
            to.setUTCMonth(month)
            to.setUTCDate(day-1)
            to.setUTCHours(23 - hour)
            to.setUTCMinutes(59)
            to.setUTCSeconds(59)
            const from = new Date()
            from.setUTCFullYear(year)
            from.setUTCMonth(month)
            from.setUTCDate(day-1)
            from.setUTCHours(0 - hour)
            from.setUTCMinutes(0)
            from.setUTCSeconds(0)


            let users

            if(hour === 3){
                users = await knex("users")
                    .transacting(trx)
                    .leftJoin("legal_infos", "users.legal_info_id", "legal_infos.id")
                    .select("users.id as id", "legal_infos.time_zone as time_zone")
                    .whereNull("legal_infos.time_zone")
                    .orWhere("legal_infos.time_zone", time_zone)

            }
            else {
                users = await knex("users")
                    .transacting(trx)
                    .leftJoin("legal_infos", "users.legal_info_id", "legal_infos.id")
                    .select("users.id as id", "legal_infos.time_zone as time_zone")
                    .where("legal_infos.time_zone", time_zone)
            }

            if(!users || users.length === 0) return

            for (let user of users){
                const machines = await knex("machines")
                    .transacting(trx)
                    .select("id")
                    .where("user_id", user.id)
                const machineIds = machines.map(i => i.id)

                const sales = await knex("sales")
                    .transacting(trx)
                    .select("price")
                    .where((builder) =>
                        builder.whereIn("machine_id", machineIds)
                    )
                    .andWhere(function() {
                        this.where("created_at", ">", from).andWhere("created_at", "<", to)
                    })
                const result = sales.reduce((acc, item) =>{
                    acc.amountYesterday = acc.amountYesterday + Number(item.price)
                    acc.countYesterday = acc.countYesterday + 1
                    return acc
                }, {amountYesterday: 0, countYesterday:0})


                await knex("temps")
                    .transacting(trx)
                    .update({
                        amount_yesterday: result.amountYesterday,
                        count_yesterday: result.countYesterday
                    })
                    .where("user_id", user.id)

            }




                        
                    
        })
    }


}



module.exports = updateFastSales
