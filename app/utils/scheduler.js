const cron = require("node-cron")

const scheduleTasks = async ({knex}) => {
    const billTelemetry = require("../jobs/billTelemetry")({knex})
    const checkForNegativeBalance = require("../jobs/checkForNegativeBalance")({knex})

    // Every day at 00:00
    cron.schedule("0 0 * * *", () => {
        billTelemetry()
            .then(() => {
                console.log("Successfully billed telemetry for current day")
            })
            .catch((e) => {
                console.error("Failed to bill telemetry for current day")
                console.error(e)
                //TODO notificate
            })
    })

    // Every day at 01:00
    cron.schedule("0 1 * * *", () => {
        checkForNegativeBalance()
            .then(() => {
                console.log("Successfully checked for negative balances")
            })
            .catch((e) => {
                console.error("Failed to check for negative balances")
                console.error(e)
                //TODO notificate
            })
    })

}

module.exports = {
    scheduleTasks
}
