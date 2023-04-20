
function updateFastSales({knex, logger}) {
    return async () => {
        return knex.transaction(async (trx) => {

            let hour = 24 - new Date().getUTCHours()
            if(hour === 24) hour = 0
            const time_zone = String(hour)

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

                try{
                    await knex("temps")
                        .transacting(trx)
                        .update({
                            amount_today: 0,
                            count_today: 0
                        })
                        .where("user_id", Number(user.id))

                }
                catch (e) {
                    logger.debug(`temp_table_error user: ${user.id}, message: ${e.message}`)
                }
            }

                        
                    
        })
    }


}



module.exports = updateFastSales
