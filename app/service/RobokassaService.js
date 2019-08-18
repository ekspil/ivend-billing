const robokassa = require("node-robokassa")
const fetch = require("node-fetch")
const parseString = require("xml2js").parseString
const hashingUtils = require("../utils/hashingUtils")
const PaymentStatus = require("../enums/PaymentStatus")
const logger = require("my-custom-logger")

class RobokassaService {


    constructor({knex}) {
        this.knex = knex
        this.robokassa = new robokassa.RobokassaHelper({
            // REQUIRED OPTIONS:
            merchantLogin: process.env.ROBOKASSA_LOGIN,
            hashingAlgorithm: "sha256",
            password1: process.env.ROBOKASSA_PASSWORD1,
            password2: process.env.ROBOKASSA_PASSWORD2,

            // OPTIONAL CONFIGURATION
            testMode: process.env.NODE_ENV !== "production", // Whether to use test mode globally
            resultUrlRequestMethod: "POST" // HTTP request method selected for "ResultURL" requests

        })

        this.requestPayment = this.requestPayment.bind(this)
        this.getPayment = this.getPayment.bind(this)
        this.verifySignature = this.verifySignature.bind(this)
    }

    verifySignature(OutSum, InvId, SignatureValue) {
        const hash = hashingUtils
            .hashSHA256(`${OutSum}:${InvId}:${process.env.ROBOKASSA_PASSWORD2}`)
        logger.info(OutSum, InvId, process.env.ROBOKASSA_PASSWORD2, hash, SignatureValue)

        return OutSum && InvId && SignatureValue && hash.toLowerCase() === SignatureValue.toLowerCase()
    }

    async requestPayment({userId, email, amount, phone}) {
        const invDesc = `Аванс по договору ЛК №${userId}`

        const result = await this.knex.raw(`select nextval('payment_id_seq');`)
        const {rows} = result
        const [row] = rows
        const {nextval} = row
        const paymentId = nextval


        const options = {
            invId: paymentId,
            email,
            isTest: process.env.NODE_ENV !== "production"
        }

        const redirectUrl = this.robokassa.generatePaymentUrl(amount, invDesc, options)

        const [paymentRequestId] = await this.knex("payment_requests")
            .returning("id")
            .insert({
                payment_id: paymentId,
                redirect_url: redirectUrl,
                status: PaymentStatus.PENDING,
                to: phone,
                created_at: new Date(),
                updated_at: new Date()
            })

        logger.info(`PaymentRequestId ${paymentRequestId} / PaymentId ${paymentId} / ${email} / ${amount} / ${redirectUrl}`)

        return {paymentRequestId}
    }

    async getPayment(paymentId) {
        const url = `https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpState?MerchantLogin=${process.env.ROBOKASSA_LOGIN}&InvoiceID=${paymentId}&Signature=${hashingUtils.hashSHA256(`${process.env.ROBOKASSA_LOGIN}:${paymentId}:${process.env.ROBOKASSA_PASSWORD2}`)}`

        const response = await fetch(url)

        const xml = await response.text()

        const json = await new Promise((resolve, reject) => {
            parseString(xml, function (err, result) {
                if (err) {
                    reject(err)
                } else {
                    resolve(result)
                }
            })
        })

        const {Result} = json.OperationStateResponse
        const [resultObj] = Result

        const {Code} = resultObj

        const [code] = Code

        switch (code) {
            case "0":
                return json.OperationStateResponse.State[0]
            case "3":
                return null
            case "1":
                throw new Error("SignatureValidationError")
            default:
                throw new Error("RobokassaUnknownCode")
        }
    }

}

module.exports = RobokassaService
