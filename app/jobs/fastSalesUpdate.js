
function updateFastSales({knex}) {
    return async () => {
        return knex.transaction(async (trx) => {

            let hour = 24 - new Date().getUTCHours()
            if(hour === 24) hour = 0
            const timeZone = String(hour)

            let users

            if(hour === 3){
                users = await knex("users")
                    .transacting(trx)
                    .leftJoin("legal_infos", "users.legal_info_id", "legal_infos.id")
                    .select("users.id as id", "legal_infos.timeZone as timeZone")
                    .whereNull("legal_infos.timeZone")
                    .orWhere("legal_infos.timeZone", timeZone)

            }
            else {
                users = await knex("users")
                    .transacting(trx)
                    .leftJoin("legal_infos", "users.legal_info_id", "legal_infos.id")
                    .select("users.id as id", "legal_infos.timeZone as timeZone")
                    .where("legal_infos.timeZone", timeZone)
            }

            if(!users || users.length === 0) return

            const userIds = users.map(user => {
                return Number(user.id)
            })

            await knex("temps")
                .transacting(trx)
                .update({
                    amount_today: 0,
                    count_today: 0
                })
                .whereIn("user_id", userIds)

                        
                    
        })
    }


}



module.exports = updateFastSales
