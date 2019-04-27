const ErrorHandler = (error, request, reply) => {
    console.error(error)

    if (error.message === "Not Found") {
        console.log("Url not found " + request.req.url)
        return reply.type("application/json").code(404).send({message: "Not found"})
    }

    if (error.message === "SignatureValidationError") {
        return reply.type("application/json").code(401).send({message: "Invalid signature"})
    }

    if (error.message === "RobokassaUnknownCode") {
        console.error("Unknown response from Robokassa")
        return reply.type("application/json").code(500).send({message: "Invalid signature"})
    }

    return reply.type("application/json").code(500).send({message: "Internal Server Error"})
}


module.exports = ErrorHandler
