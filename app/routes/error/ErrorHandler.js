const logger = require("my-custom-logger")

const ErrorHandler = (error, request, reply) => {
    if (error.message === "Not Found") {
        logger.error("Url not found " + request.req.url)
        return reply.type("application/json").code(404).send({message: "Not found"})
    }

    if (error.message === "SignatureValidationError") {
        logger.error("Rejected request due invalid signature [401]")
        return reply.type("application/json").code(401).send({message: "Invalid signature"})
    }

    if (error.message === "RobokassaUnknownCode") {
        logger.error("Unknown response from Robokassa")
        return reply.type("application/json").code(500).send({message: "Internal Server Error"})
    }

    if (error.message === "PaymentRequestNotFound") {
        logger.error("Payment request not found")
        return reply.type("application/json").code(500).send({message: "Internal Server Error"})
    }

    if (error.message === "DepositNotFound") {
        logger.error("Deposit not found")
        return reply.type("application/json").code(500).send({message: "Internal Server Error"})
    }

    if (error.message === "PaymentRequestAlreadyProcessed") {
        logger.error("PaymentRequestAlreadyProcessed")
        return reply.type("application/json").code(200).send({message: "PaymentAlreadyProcessed"})
    }

    logger.error(error)
    return reply.type("application/json").code(500).send({message: "Internal Server Error"})
}


module.exports = ErrorHandler
