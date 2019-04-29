const robokassa = require("node-robokassa")
const fetch = require("node-fetch")
const parseString = require("xml2js").parseString
const hashingUtils = require("../utils/hashingUtils")

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
            testMode: true, // Whether to use test mode globally
            resultUrlRequestMethod: "POST" // HTTP request method selected for "ResultURL" requests

        })

        this.requestPayment = this.requestPayment.bind(this)
        this.getPayment = this.getPayment.bind(this)
        this.verifySignature = this.verifySignature.bind(this)
    }

    verifySignature(OutSum, InvId, SignatureValue) {
        const hash = hashingUtils
            .hashSHA256(`${OutSum}:${InvId}:${this.robokassa.password2}`)
        console.log(OutSum, InvId, this.robokassa.password2, hash, SignatureValue)

        return OutSum && InvId && SignatureValue && hash.toLowerCase() === SignatureValue.toLowerCase()
    }

    async requestPayment(to, email, amount) {
        const invDesc = "Test payment"

        const result = await this.knex.raw(`select nextval('payment_id_seq');`)
        const {rows} = result
        const [row] = rows
        const {nextval} = row
        const paymentId = nextval


        const options = {
            invId: paymentId,
            email,
            isTest: true
        }

        const redirectUrl = this.robokassa.generatePaymentUrl(amount, invDesc, options)

        const [paymentRequestId] = await this.knex("payment_requests")
            .returning("id")
            .insert({
                payment_id: paymentId,
                redirect_url: redirectUrl,
                status: "pending",
                to,
                created_at: new Date(),
                updated_at: new Date()
            })

        console.log(`PaymentRequestId ${paymentRequestId} / PaymentId ${paymentId} / ${email} / ${amount} / ${redirectUrl}`)

        return {paymentRequestId}
    }

    validateResultUrl(hash, outSum, invId) {
        return this.robokassa.validateResultUrlHash(hash, outSum, invId)
    }

    async getPayment(paymentId) {
        const url = `https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpState?MerchantLogin=${process.env.ROBOKASSA_LOGIN}&InvoiceID=${paymentId}&Signature=${hashingUtils.hashSHA256(`${process.env.ROBOKASS_LOGIN}:${paymentId}:${this.robokassa.password2}`)}`

        console.log("fetching " + url)
        const response = await fetch(url)

        const xml = await response.text()

        console.log(xml)

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

        const {Code, Description} = resultObj

        const [code] = Code
        const [description] = Description

        console.log(`paymentId ${paymentId} code ${code} description ${description}`)

        switch (code) {
            case "0":
                const {State} = json.OperationStateResponse
                const [stateObj] = State

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
