const cron = require("node-cron")
const logger = require("my-custom-logger")

const scheduleTasks = async ({knex}) => {
    const billTelemetry = require("../jobs/billTelemetry")({knex})
    const billTelemetryPartner = require("../jobs/billTelemetryPartner")({knex})
    const checkForNegativeBalance = require("../jobs/checkForNegativeBalance")({knex})
    const fastSalesUpdate = require("../jobs/fastSalesUpdate")({knex})
    const yesterdaySalesUpdate = require("../jobs/yesterdaySalesUpdate")({knex})
    const checkForBills = require("../jobs/checkForBills")({knex})


    // Every day at 00:00
    cron.schedule("0 0 * * *", () => {
        fastSalesUpdate()
            .then(() => {
                logger.info("Successfully updated fast sales table for current day")
            })
            .catch((e) => {
                logger.error("Failed to update fast sales table for current day")
                logger.error(e)
                //TODO notificate
            })
    })
    // Every day at 00:01
    cron.schedule("01 0 * * *", () => {
        yesterdaySalesUpdate()
            .then(() => {
                logger.info("Successfully updated fast sales table for yesterday")
            })
            .catch((e) => {
                logger.error("Failed to update fast sales table for yesterday")
                logger.error(e)
                //TODO notificate
            })
    })

    // Every day at 03:00
    cron.schedule("0 3 * * *", () => {
        billTelemetry()
            .then(() => {
                logger.info("Successfully billed telemetry for current day")
            })
            .catch((e) => {
                logger.error("Failed to bill telemetry for current day")
                logger.error(e)
                //TODO notificate
            })
    })

    // Every day at 01:00
    cron.schedule("0 1 * * *", () => {
        billTelemetryPartner()
            .then(() => {
                logger.info("Successfully billed partner telemetry for current day")
            })
            .catch((e) => {
                logger.error("Failed to bill partner telemetry for current day")
                logger.error(e)
                //TODO notificate
            })
    })

    // Ежедневная проверка поступлений
    cron.schedule("*/15 * * * *", () => {
        checkForBills()
            .then(() => {
                logger.info("Successfully checked for bank payments")
            })
            .catch((e) => {
                logger.error("Failed to check bank payments")
                logger.error(e)
                //TODO notificate
            })
    })

    // Every day at 01:00
    cron.schedule("* */4 * * *", () => {
        checkForNegativeBalance()
            .then(() => {
                logger.info("Successfully checked for negative balances")
            })
            .catch((e) => {
                logger.error("Failed to check for negative balances")
                logger.error(e)
                //TODO notificate
            })
    })

}

module.exports = {
    scheduleTasks
}
