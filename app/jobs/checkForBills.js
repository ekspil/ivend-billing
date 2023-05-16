const logger = require("my-custom-logger")
const fetch = require("node-fetch")
const PaymentStatus = require("../enums/PaymentStatus")
function getDate(){
    const date = new Date(Date.now())
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

        const urlStatement = "https://enter.tochka.com/uapi/open-banking/v1.0/statements"

        const accountId = "40702810203500006986/044525104"

        const body = {
            Data: {
                Statement: {
                    accountId,
                    startDateTime: getDate(),
                    endDateTime: getDate()
                }
            }
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
        const request_id = jsonStatement.Data.Statement.statementId

        const timer = async () => {

            return new Promise(async (resolve)=>{
                setTimeout(()=>{
                    resolve()},5000)
            })
        }
        await timer()

        const result = await fetch(`https://enter.tochka.com/uapi/open-banking/v1.0/accounts/${accountId}/statements/${request_id}`, {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + process.env.BANK_TOKEN
            },
        })
        logger.info(`BILLING_BANK_REQUEST_STATUS2_${result.status}`)
        const json = await result.json()
        if(!json.Data || json.Data.Statement.length < 1 || !json.Data.Statement[0].Transaction) return

        const payments = json.Data.Statement[0].Transaction.filter(item => {
            if(Number(item.Amount.amount) > 0) return true
            return false
        })

        for( let pay of payments){
            const paymentAmount = pay.Amount.amount
            const subString = "VFT"
            const subString2 = "VTF"
            const string = pay.description.toUpperCase()

            if( !string.includes(subString) && !string.includes(subString2)) continue
            let finded = false
            const num = string.split(" ").find(item => {
                if(finded) {
                    finded = false
                    return true
                }
                if ((item.includes(subString) || item.includes(subString2)) && (item !== subString && item !== subString2)) return true
                if ((item.includes(subString) || item.includes(subString2)) && (item === subString || item === subString2)) {
                    finded = true
                    return false
                }

                return false
            })

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



                await knex("bank_payments")
                    .transacting(trx)
                    .update({
                        applied: true,
                        meta: pay.transactionId
                    })
                    .where("id", Number(orderId))

                const [TrId] = await knex("transactions")
                    .transacting(trx)
                    .returning("id")
                    .insert({
                        amount: Number(paymentAmount),
                        user_id: Number(bank_payment.user_id),
                        meta: `BANK_PAYMENT_${orderId}_USER_${bank_payment.user_id}`,
                        created_at: new Date(),
                        updated_at: new Date()
                    })

                const [paymentRequestId] = await knex("payment_requests")
                    .transacting(trx)
                    .returning("id")
                    .insert({
                        payment_id: "BANK_AUTO-" + TrId,
                        redirect_url: "BANK_AUTO-" + TrId,
                        status: PaymentStatus.SUCCEEDED,
                        to: "none",
                        created_at: new Date(),
                        updated_at: new Date()
                    })


                await knex("deposits")
                    .transacting(trx)
                    .insert({
                        amount: Number(paymentAmount),
                        payment_request_id: Number(paymentRequestId),
                        user_id: Number(bank_payment.user_id),
                        created_at: new Date(),
                        updated_at: new Date()
                    })


                logger.info(`billing_bank_integration_success bill: VFT${orderId}, user: ${bank_payment.user_id}, amount: ${paymentAmount}`)

            })


        }
    }
}



module.exports = billDailyServices
