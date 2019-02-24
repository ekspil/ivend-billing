const cron = require("node-cron")

const scheduleTasks = async ({knex, yandexKassaService}) => {
    const checkPaymentRequestsJob = require("../jobs/checkPaymentRequests")({knex, yandexKassaService})

    cron.schedule("*/1 * * * *", () => {
        checkPaymentRequestsJob()
            .then(console.log)
            .catch(console.error)
    })

}

module.exports = {
    scheduleTasks
}
