class YandexKassaService {


    constructor() {
        this.yandexCheckout = require("yandex-checkout")({
            shopId: process.env.YANDEX_SHOP_ID,
            secretKey: process.env.YANDEX_SECRET_KEY
        })

        this.requestPayment = this.requestPayment.bind(this)
        this.getPayment = this.getPayment.bind(this)
    }

    async requestPayment(amount, idempotenceKey) {
        return await this.yandexCheckout.createPayment({
            "amount": {
                "value": amount + "",
                "currency": "RUB"
            },
            "confirmation": {
                "type": "redirect",
                "return_url": process.env.YANDEX_RETURN_URL
            },
            "capture": true
        }, idempotenceKey)

    }

    async getPayment(paymentId) {
        return await this.yandexCheckout.getPayment(paymentId)
    }

}

module.exports = YandexKassaService
