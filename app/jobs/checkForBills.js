const logger = require("my-custom-logger")
const fetch = require("node-fetch")
function getDate(){
    const date = new Date(Date.now()-3600000)
    const year = date.getFullYear()
    let month = String(date.getMonth() + 1)
    let day = String(date.getDate())
    if (month.length === 1) month = "0" + month
    if (day.length === 1) day = "0" + day
    return `${year}-${month}-${day}`
}

function billDailyServices({knex}) {
    return async () => {
        logger.info(`BILLING_BANK_REQUEST_${getDate()}`)

        const urlStatement = "https://enter.tochka.com//api/v1/statement"



        const body = {
            "account_code": "40702810203500006986",
            "bank_code": "044525999",
            "date_end": getDate(),
            "date_start": getDate()
        }

        const optsStatement = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + process.env.BANK_TOKEN
            },
            body: JSON.stringify(body)
        }

        const resultStatement = await fetch(urlStatement, optsStatement)
        logger.info(`BILLING_BANK_REQUEST_STATUS1_${resultStatement.status}`)
        const jsonStatement = await resultStatement.json()
        const request_id = jsonStatement.request_id

        const result = await fetch("https://enter.tochka.com/api/v1/statement/result/" + request_id, {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + process.env.BANK_TOKEN
            },
        })
        logger.info(`BILLING_BANK_REQUEST_STATUS2_${result.status}`)
        const json = await result.json()
        if(!json.payments || json.payments.length < 1) return

        const payments = json.payments.filter(item => {
            if(Number(item.payment_amount) > 0) return true
            return false
        })

        for( let pay of payments){
            logger.info(`BILLING_BANK_REQUEST_PAY_${JSON.stringify(pay)}`)
            const subString = "VFT"
            const string = pay.payment_purpose.toUpperCase()
            if( !string.includes(subString)) continue

            const num = string.split(" ").find(item => item.includes(subString))

            const orderId = Number(num.replace(/[^\d.-]/g, ""))

            await knex.transaction(async (trx) => {

                const [bank_payment]= await knex("bank_payments")
                    .transacting(trx)
                    .select("id", "user_id", "applied")
                    .where({
                        id: orderId,
                        applied: false
                    })

                if(!bank_payment) {
                    logger.info(`billing_bank_integration_error bill_not_found VFT${orderId}`)
                    return false
                }

                logger.info(`BILLING_BANK_REQUEST_BANK_PAYMENT_${JSON.stringify(bank_payment)}`)


                await knex("bank_payments")
                    .transacting(trx)
                    .update({
                        applied: true,
                        meta: pay.payment_bank_system_id
                    })
                    .where("id", Number(orderId))

                await knex("transactions")
                    .transacting(trx)
                    .insert({
                        amount: Number(pay.payment_amount),
                        user_id: Number(bank_payment.user_id),
                        meta: `BANK_PAYMENT_${orderId}_USER_${bank_payment.user_id}`,
                        created_at: new Date(),
                        updated_at: new Date()
                    })

                logger.info(`billing_bank_integration_success bill: VFT${orderId}, user: ${bank_payment.user_id}, amount: ${pay.payment_amount}`)

            })


        }
    }
}



module.exports = billDailyServices
