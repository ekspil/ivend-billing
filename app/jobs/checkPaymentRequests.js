function checkPaymentRequests({knex, yandexKassaService}) {
    return async () => {
        const paymentRequests = await knex
            .select("id", "status", "payment_id", "to")
            .from("payment_requests")
            .where("status", "pending")


        for (const paymentRequest of paymentRequests) {

            const {payment_id, to} = paymentRequest
            //Request actual info about payment
            const updatedPaymentRequest = await yandexKassaService.getPayment(payment_id)

            const updatedStatus = updatedPaymentRequest.status

            //get status
            if (updatedStatus !== "pending") {
                console.log(`New status update for ${payment_id}. New status: ${updatedStatus}`)

                //succeeded or cancelled
                switch (updatedStatus) {
                    case "succeeded":
                        // Add transaction
                        // Set status
                        await knex.transaction((trx) => {
                            return knex
                                .transacting(trx)
                                .from("deposits")
                                .where("payment_request_id", paymentRequest.id)
                                .select("id", "amount", "user_id")
                                .first()
                                .then((deposit) => {
                                    return knex("transactions")
                                        .transacting(trx)
                                        .insert({
                                            amount: deposit.amount,
                                            user_id: deposit.user_id,
                                            meta: `deposit_${deposit.id}`,
                                            created_at: new Date(),
                                            updated_at: new Date()
                                        })
                                        .then((resp) => {
                                            return knex("payment_requests")
                                                .transacting(trx)
                                                .where("id", "=", paymentRequest.id)
                                                .update({status: updatedStatus})
                                        })
                                })


                                .then(trx.commit)
                                .catch(trx.rollback)
                        })
                        console.log(`Payment ${payment_id} succesfully confirmed`)
                        break
                    case "canceled":
                        //update
                        //set failed state
                        const result = await knex("payment_requests")
                            .where("id", "=", paymentRequest.id)
                            .update({status: updatedStatus})
                            .returning("id")
                        console.log(`Payment ${payment_id} was cancelled`)
                        break
                    default:
                        throw new Error("Payment request updated to unknown status")
                }

            }

        }

    }
}


module.exports = checkPaymentRequests



