const uuidv4 = require("uuid/v4")

function Routes({fastify, knex, yandexKassaService}) {

    const createPayment = async (request, reply) => {
        const idempotenceKey = uuidv4()

        const {amount, to} = request.body

        try {
            const payment = await yandexKassaService.requestPayment(amount, idempotenceKey)
            const {confirmation_url} = payment.confirmation
            const {id, status} = payment


            const [paymentRequestId] = await knex("payment_requests")
                .returning("id")
                .insert({
                    payment_id: id,
                    idempotence_key: idempotenceKey,
                    redirect_url: confirmation_url,
                    status,
                    to,
                    created_at: new Date(),
                    updated_at: new Date()
                })


            reply.type("application/json").code(200)
            return {
                paymentRequestId
            }

        } catch (e) {
            console.error(e)
            console.error(e.stack)
            reply.type("application/json").code(500)
            return {}
        }
    }


    fastify.post("/api/v1/billing/createPayment", createPayment)

}

module.exports = Routes
