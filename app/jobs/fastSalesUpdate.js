
function updateFastSales({knex}) {
    return async () => {
        return knex.transaction(async (trx) => {

            await knex("temps")
                .transacting(trx)
                .update({
                    amount_today: 0,
                    count_today: 0
                })

                        
                    
        })
    }


}



module.exports = updateFastSales
