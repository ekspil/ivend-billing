const crypto = require("crypto")

const hashSHA256 = (str) => {
    return crypto.createHash("sha256").update(str).digest("hex")
}

module.exports = {
    hashSHA256
}
