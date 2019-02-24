function checkPaymentRequests({knex, yandexKassaService}) {
    return async () => {
        console.log(`Starting checkPaymentRequest job at ${new Date()}`)

        const paymentRequests = await knex
            .select("id", "status", "paymentId", "to")
            .from("payment_requests")
            .where("status", "pending")


        for (const paymentRequest of paymentRequests) {

            const {paymentId, to} = paymentRequest
            //Request actual info about payment
            const updatedPaymentRequest = await yandexKassaService.getPayment(paymentId)

            const updatedStatus = updatedPaymentRequest.status

            //get status
            if (updatedStatus !== "pending") {

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
                                            createdAt: new Date(),
                                            updatedAt: new Date()
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
                        console.log(`Payment ${paymentId} succesfully confirmed`)
                        break
                    case "canceled":
                        //update
                        //set failed state
                        const result = await knex("payment_requests")
                            .where("id", "=", paymentRequest.id)
                            .update({status: updatedStatus})
                            .returning("id")
                        console.log(`Payment ${paymentId} was cancelled`)
                        break
                    default:
                        throw new Error("Payment request updated to unknown status")
                }

            }

        }

    }
}


module.exports = checkPaymentRequests



