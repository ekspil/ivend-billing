
function updateFastSales({knex}) {
    return async () => {
        return knex.transaction(async (trx) => {
            const day = new Date().getDate()
            const month = new Date().getMonth()
            const year = new Date().getFullYear()

            const to = new Date(year, month, day-1, 23, 59, 59)
            const from = new Date(year, month, day-1, 0, 0, 0)

            const users = await knex("users")
                .transacting(trx)
                .select("id")

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
