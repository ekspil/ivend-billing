const robokassa = require("node-robokassa")
const fetch = require("node-fetch")
const parseString = require("xml2js").parseString
const hashingUtils = require("../utils/hashingUtils")
const PaymentStatus = require("../enums/PaymentStatus")
const logger = require("my-custom-logger")

const crypto = require("crypto")
const url = require("url")
const _ = require("lodash")



class RobokassaService {


    constructor({knex}) {
        this.knex = knex

        this.config = {

            // Main parameters.
            merchantLogin: process.env.ROBOKASSA_LOGIN,
            hashingAlgorithm: "sha256",
            password1: process.env.ROBOKASSA_PASSWORD1,
            password2: process.env.ROBOKASSA_PASSWORD2,
            testMode: false,
            resultUrlRequestMethod: "POST",

            // Additional configuration.
            paymentUrlTemplate: "https://auth.robokassa.ru/Merchant/Index.aspx",
            debug: false,
            userDataKeyPrefix: "",

            // List of keys supported in "ResultURL" requests
            // Set to "true" to mark specific key as "required"
            resultUrlKeys: {
                OutSum: true,
                InvId: true,
                Receipt: true,
                SignatureValue: true
            }

        }
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
        this.generatePaymentUrl = this.generatePaymentUrl.bind(this)
        this.calculatePaymentUrlHash = this.calculatePaymentUrlHash.bind(this)
        this.calculateHash = this.calculateHash.bind(this)
    }

    calculateHash (value) {

        const hash = crypto.createHash(this.config.hashingAlgorithm)

        hash.update(value)

        return hash.digest("hex")

    }

    calculatePaymentUrlHash (outSum, options) {

        let values = [
            this.config.merchantLogin,
            outSum,
            (options && options.invId ? options.invId : "")
        ]

        if (options.outSumCurrency) {
            values.push(options.outSumCurrency)
        }



        // Custom user data.
        if (options.userData) {
            let userData = []
            _.forEach(options.userData, (value, key) => {
                const rkKey = this.config.userDataKeyPrefix + key
                if (key === "Receipt"){

                    userData.push(value)
                }else {

                    userData.push(rkKey + "=" + value)
                }
            })
            values = values.concat(userData.sort())
        }
        values.push(this.config.password1)

        return this.calculateHash(
            values.join(":")
        )

    }


    generatePaymentUrl (outSum, invDesc, options) {

        const defaultOptions = {
            invId: null,
            email: null,
            outSumCurrency: null,
            userData: {}
        }
        options = _.extend({}, defaultOptions, options || {})

        const values = {
            MerchantLogin: this.config.merchantLogin,
            OutSum: outSum,
            Description: invDesc,
            SignatureValue: this.calculatePaymentUrlHash(outSum, options),
            Encoding: (options.encoding || "utf-8")
        }

        // InvId.
        if (options.invId) {
            values.InvId = options.invId
        }

        // E-Mail.
        if (options.email) {
            values.Email = options.email
        }

        // OutSumCurrency.
        if (options.outSumCurrency) {
            values.OutSumCurrency = options.outSumCurrency
        }

        // Is Test.
        if (this.config.testMode || options.isTest) {
            values.IsTest = 1
        }

        // Custom user data.
        if (options.userData) {
            _.forEach(options.userData, (value, key) => {
                values[this.config.userDataKeyPrefix + key] = value
            })
        }

        const oUrl = url.parse(this.config.paymentUrlTemplate, true)
        delete oUrl.search
        _.extend(oUrl.query, values)

        return url.format(oUrl)
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

        const items = {
            "items": [{
                "name": "Абонентская плата за Услугу телеметрии",
                "quantity": 1,
                "sum":  amount,
                "payment_method": "full_payment",
                "payment_object": "payment",
                "tax": "none"
            }]
        }
        
        const Receipt = JSON.stringify(items)


        const options = {
            invId: paymentId,
            email,
            userData: {
                Receipt
            },
            isTest: process.env.NODE_ENV !== "production"
        }

        const redirectUrl = this.generatePaymentUrl(amount, invDesc, options)

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
