'use strict'
module.exports.combineRgb = (r,g,b) => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255)
