const crypto = require("crypto")
const hash = crypto.createHash("sha256")

const hashSHA256 = (str) => {
    hash.update(str)
    return hash.digest("hex")
}

module.exports = {
    hashSHA256
}
