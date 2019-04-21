const ErrorHandler = (error, request, reply) => {
    console.error(error)

    if (error.message === "Not Found") {
        return reply.type("application/json").code(404).send({message: "Not found"})
    }

    return reply.type("application/json").code(500).send({message: "Internal Server Error"})
}


module.exports = ErrorHandler
