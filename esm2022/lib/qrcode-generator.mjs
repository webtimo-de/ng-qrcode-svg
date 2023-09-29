/*
 * QR Code generator library (TypeScript)
 *
 * Copyright (c) Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the
 *   Software.
 */
class QrCode {
    static encodeText(text, ecl) {
        const segs = QrSegment.makeSegments(text);
        return QrCode.encodeSegments(segs, ecl);
    }
    static encodeBinary(data, ecl) {
        const seg = QrSegment.makeBytes(data);
        return QrCode.encodeSegments([seg], ecl);
    }
    static encodeSegments(segs, ecl, minVersion = 1, maxVersion = 40, mask = -1, boostEcl = true) {
        if (!(QrCode.MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= QrCode.MAX_VERSION) ||
            mask < -1 ||
            mask > 7) {
            throw new RangeError('Invalid value');
        }
        let version;
        let dataUsedBits;
        for (version = minVersion;; version++) {
            const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
            const usedBits = QrSegment.getTotalBits(segs, version);
            if (usedBits <= dataCapacityBits) {
                dataUsedBits = usedBits;
                break;
            }
            if (version >= maxVersion) {
                throw new RangeError('Data too long');
            }
        }
        for (const newEcl of [Ecc.MEDIUM, Ecc.QUARTILE, Ecc.HIGH]) {
            if (boostEcl && dataUsedBits <= QrCode.getNumDataCodewords(version, newEcl) * 8) {
                ecl = newEcl;
            }
        }
        let bb = [];
        for (const seg of segs) {
            appendBits(seg.mode.modeBits, 4, bb);
            appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
            for (const b of seg.getData()) {
                bb.push(b);
            }
        }
        assert(bb.length == dataUsedBits);
        const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
        assert(bb.length <= dataCapacityBits);
        appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
        appendBits(0, (8 - (bb.length % 8)) % 8, bb);
        assert(bb.length % 8 == 0);
        for (let padByte = 0xec; bb.length < dataCapacityBits; padByte ^= 0xec ^ 0x11) {
            appendBits(padByte, 8, bb);
        }
        let dataCodewords = [];
        while (dataCodewords.length * 8 < bb.length) {
            dataCodewords.push(0);
        }
        bb.forEach((b, i) => (dataCodewords[i >>> 3] |= b << (7 - (i & 7))));
        return new QrCode(version, ecl, dataCodewords, mask);
    }
    constructor(version, errorCorrectionLevel, dataCodewords, msk) {
        this.version = version;
        this.errorCorrectionLevel = errorCorrectionLevel;
        this.modules = [];
        this.isFunction = [];
        if (version < QrCode.MIN_VERSION || version > QrCode.MAX_VERSION) {
            throw new RangeError('Version value out of range');
        }
        if (msk < -1 || msk > 7) {
            throw new RangeError('Mask value out of range');
        }
        this.size = version * 4 + 17;
        let row = [];
        for (let i = 0; i < this.size; i++) {
            row.push(false);
        }
        for (let i = 0; i < this.size; i++) {
            this.modules.push(row.slice());
            this.isFunction.push(row.slice());
        }
        this.drawFunctionPatterns();
        const allCodewords = this.addEccAndInterleave(dataCodewords);
        this.drawCodewords(allCodewords);
        if (msk == -1) {
            let minPenalty = 1000000000;
            for (let i = 0; i < 8; i++) {
                this.applyMask(i);
                this.drawFormatBits(i);
                const penalty = this.getPenaltyScore();
                if (penalty < minPenalty) {
                    msk = i;
                    minPenalty = penalty;
                }
                this.applyMask(i);
            }
        }
        assert(0 <= msk && msk <= 7);
        this.mask = msk;
        this.applyMask(msk);
        this.drawFormatBits(msk);
        this.isFunction = [];
    }
    getModule(x, y) {
        return 0 <= x && x < this.size && 0 <= y && y < this.size && this.modules[y][x];
    }
    drawFunctionPatterns() {
        for (let i = 0; i < this.size; i++) {
            this.setFunctionModule(6, i, i % 2 == 0);
            this.setFunctionModule(i, 6, i % 2 == 0);
        }
        this.drawFinderPattern(3, 3);
        this.drawFinderPattern(this.size - 4, 3);
        this.drawFinderPattern(3, this.size - 4);
        const alignPatPos = this.getAlignmentPatternPositions();
        const numAlign = alignPatPos.length;
        for (let i = 0; i < numAlign; i++) {
            for (let j = 0; j < numAlign; j++) {
                if (!((i == 0 && j == 0) || (i == 0 && j == numAlign - 1) || (i == numAlign - 1 && j == 0))) {
                    this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
                }
            }
        }
        this.drawFormatBits(0);
        this.drawVersion();
    }
    drawFormatBits(mask) {
        const data = (this.errorCorrectionLevel.formatBits << 3) | mask;
        let rem = data;
        for (let i = 0; i < 10; i++) {
            rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        }
        const bits = ((data << 10) | rem) ^ 0x5412;
        assert(bits >>> 15 == 0);
        for (let i = 0; i <= 5; i++) {
            this.setFunctionModule(8, i, getBit(bits, i));
        }
        this.setFunctionModule(8, 7, getBit(bits, 6));
        this.setFunctionModule(8, 8, getBit(bits, 7));
        this.setFunctionModule(7, 8, getBit(bits, 8));
        for (let i = 9; i < 15; i++) {
            this.setFunctionModule(14 - i, 8, getBit(bits, i));
        }
        for (let i = 0; i < 8; i++) {
            this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
        }
        for (let i = 8; i < 15; i++) {
            this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
        }
        this.setFunctionModule(8, this.size - 8, true);
    }
    drawVersion() {
        if (this.version < 7) {
            return;
        }
        let rem = this.version;
        for (let i = 0; i < 12; i++) {
            rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        }
        const bits = (this.version << 12) | rem; // uint18
        assert(bits >>> 18 == 0);
        for (let i = 0; i < 18; i++) {
            const color = getBit(bits, i);
            const a = this.size - 11 + (i % 3);
            const b = Math.floor(i / 3);
            this.setFunctionModule(a, b, color);
            this.setFunctionModule(b, a, color);
        }
    }
    drawFinderPattern(x, y) {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const dist = Math.max(Math.abs(dx), Math.abs(dy));
                const xx = x + dx;
                const yy = y + dy;
                if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size) {
                    this.setFunctionModule(xx, yy, dist != 2 && dist != 4);
                }
            }
        }
    }
    drawAlignmentPattern(x, y) {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) != 1);
            }
        }
    }
    setFunctionModule(x, y, isDark) {
        this.modules[y][x] = isDark;
        this.isFunction[y][x] = true;
    }
    addEccAndInterleave(data) {
        const ver = this.version;
        const ecl = this.errorCorrectionLevel;
        if (data.length != QrCode.getNumDataCodewords(ver, ecl)) {
            throw new RangeError('Invalid argument');
        }
        const numBlocks = QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
        const blockEccLen = QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
        const rawCodewords = Math.floor(QrCode.getNumRawDataModules(ver) / 8);
        const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
        const shortBlockLen = Math.floor(rawCodewords / numBlocks);
        let blocks = [];
        const rsDiv = QrCode.reedSolomonComputeDivisor(blockEccLen);
        for (let i = 0, k = 0; i < numBlocks; i++) {
            let dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
            k += dat.length;
            const ecc = QrCode.reedSolomonComputeRemainder(dat, rsDiv);
            if (i < numShortBlocks) {
                dat.push(0);
            }
            blocks.push(dat.concat(ecc));
        }
        let result = [];
        for (let i = 0; i < blocks[0].length; i++) {
            blocks.forEach((block, j) => {
                if (i != shortBlockLen - blockEccLen || j >= numShortBlocks) {
                    result.push(block[i]);
                }
            });
        }
        assert(result.length == rawCodewords);
        return result;
    }
    drawCodewords(data) {
        if (data.length != Math.floor(QrCode.getNumRawDataModules(this.version) / 8)) {
            throw new RangeError('Invalid argument');
        }
        let i = 0;
        for (let right = this.size - 1; right >= 1; right -= 2) {
            if (right == 6) {
                right = 5;
            }
            for (let vert = 0; vert < this.size; vert++) {
                for (let j = 0; j < 2; j++) {
                    const x = right - j;
                    const upward = ((right + 1) & 2) == 0;
                    const y = upward ? this.size - 1 - vert : vert;
                    if (!this.isFunction[y][x] && i < data.length * 8) {
                        this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
                        i++;
                    }
                }
            }
        }
        assert(i == data.length * 8);
    }
    applyMask(mask) {
        if (mask < 0 || mask > 7) {
            throw new RangeError('Mask value out of range');
        }
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                let invert;
                switch (mask) {
                    case 0:
                        invert = (x + y) % 2 == 0;
                        break;
                    case 1:
                        invert = y % 2 == 0;
                        break;
                    case 2:
                        invert = x % 3 == 0;
                        break;
                    case 3:
                        invert = (x + y) % 3 == 0;
                        break;
                    case 4:
                        invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 == 0;
                        break;
                    case 5:
                        invert = ((x * y) % 2) + ((x * y) % 3) == 0;
                        break;
                    case 6:
                        invert = (((x * y) % 2) + ((x * y) % 3)) % 2 == 0;
                        break;
                    case 7:
                        invert = (((x + y) % 2) + ((x * y) % 3)) % 2 == 0;
                        break;
                    default:
                        throw new Error('Unreachable');
                }
                if (!this.isFunction[y][x] && invert) {
                    this.modules[y][x] = !this.modules[y][x];
                }
            }
        }
    }
    getPenaltyScore() {
        let result = 0;
        for (let y = 0; y < this.size; y++) {
            let runColor = false;
            let runX = 0;
            let runHistory = [0, 0, 0, 0, 0, 0, 0];
            for (let x = 0; x < this.size; x++) {
                if (this.modules[y][x] == runColor) {
                    runX++;
                    if (runX == 5) {
                        result += QrCode.PENALTY_N1;
                    }
                    else if (runX > 5) {
                        result++;
                    }
                }
                else {
                    this.finderPenaltyAddHistory(runX, runHistory);
                    if (!runColor) {
                        result += this.finderPenaltyCountPatterns(runHistory) * QrCode.PENALTY_N3;
                    }
                    runColor = this.modules[y][x];
                    runX = 1;
                }
            }
            result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * QrCode.PENALTY_N3;
        }
        for (let x = 0; x < this.size; x++) {
            let runColor = false;
            let runY = 0;
            let runHistory = [0, 0, 0, 0, 0, 0, 0];
            for (let y = 0; y < this.size; y++) {
                if (this.modules[y][x] == runColor) {
                    runY++;
                    if (runY == 5) {
                        result += QrCode.PENALTY_N1;
                    }
                    else if (runY > 5) {
                        result++;
                    }
                }
                else {
                    this.finderPenaltyAddHistory(runY, runHistory);
                    if (!runColor) {
                        result += this.finderPenaltyCountPatterns(runHistory) * QrCode.PENALTY_N3;
                    }
                    runColor = this.modules[y][x];
                    runY = 1;
                }
            }
            result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * QrCode.PENALTY_N3;
        }
        for (let y = 0; y < this.size - 1; y++) {
            for (let x = 0; x < this.size - 1; x++) {
                const color = this.modules[y][x];
                if (color == this.modules[y][x + 1] && color == this.modules[y + 1][x] && color == this.modules[y + 1][x + 1]) {
                    result += QrCode.PENALTY_N2;
                }
            }
        }
        let dark = 0;
        for (const row of this.modules) {
            dark = row.reduce((sum, color) => sum + (color ? 1 : 0), dark);
        }
        const total = this.size * this.size;
        const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
        assert(0 <= k && k <= 9);
        result += k * QrCode.PENALTY_N4;
        assert(0 <= result && result <= 2568888);
        return result;
    }
    getAlignmentPatternPositions() {
        if (this.version == 1) {
            return [];
        }
        else {
            const numAlign = Math.floor(this.version / 7) + 2;
            const step = this.version == 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
            let result = [6];
            for (let pos = this.size - 7; result.length < numAlign; pos -= step) {
                result.splice(1, 0, pos);
            }
            return result;
        }
    }
    static getNumRawDataModules(ver) {
        if (ver < QrCode.MIN_VERSION || ver > QrCode.MAX_VERSION) {
            throw new RangeError('Version number out of range');
        }
        let result = (16 * ver + 128) * ver + 64;
        if (ver >= 2) {
            const numAlign = Math.floor(ver / 7) + 2;
            result -= (25 * numAlign - 10) * numAlign - 55;
            if (ver >= 7) {
                result -= 36;
            }
        }
        assert(208 <= result && result <= 29648);
        return result;
    }
    static getNumDataCodewords(ver, ecl) {
        return (Math.floor(QrCode.getNumRawDataModules(ver) / 8) -
            QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver]);
    }
    static reedSolomonComputeDivisor(degree) {
        if (degree < 1 || degree > 255) {
            throw new RangeError('Degree out of range');
        }
        let result = [];
        for (let i = 0; i < degree - 1; i++) {
            result.push(0);
        }
        result.push(1);
        let root = 1;
        for (let i = 0; i < degree; i++) {
            for (let j = 0; j < result.length; j++) {
                result[j] = QrCode.reedSolomonMultiply(result[j], root);
                if (j + 1 < result.length) {
                    result[j] ^= result[j + 1];
                }
            }
            root = QrCode.reedSolomonMultiply(root, 0x02);
        }
        return result;
    }
    static reedSolomonComputeRemainder(data, divisor) {
        let result = divisor.map((_) => 0);
        for (const b of data) {
            const factor = b ^ result.shift();
            result.push(0);
            divisor.forEach((coef, i) => (result[i] ^= QrCode.reedSolomonMultiply(coef, factor)));
        }
        return result;
    }
    static reedSolomonMultiply(x, y) {
        if (x >>> 8 != 0 || y >>> 8 != 0) {
            throw new RangeError('Byte out of range');
        }
        let z = 0;
        for (let i = 7; i >= 0; i--) {
            z = (z << 1) ^ ((z >>> 7) * 0x11d);
            z ^= ((y >>> i) & 1) * x;
        }
        assert(z >>> 8 == 0);
        return z;
    }
    finderPenaltyCountPatterns(runHistory) {
        const n = runHistory[1];
        assert(n <= this.size * 3);
        const core = n > 0 && runHistory[2] == n && runHistory[3] == n * 3 && runHistory[4] == n && runHistory[5] == n;
        return ((core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
            (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0));
    }
    finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory) {
        if (currentRunColor) {
            this.finderPenaltyAddHistory(currentRunLength, runHistory);
            currentRunLength = 0;
        }
        currentRunLength += this.size;
        this.finderPenaltyAddHistory(currentRunLength, runHistory);
        return this.finderPenaltyCountPatterns(runHistory);
    }
    finderPenaltyAddHistory(currentRunLength, runHistory) {
        if (runHistory[0] == 0) {
            currentRunLength += this.size;
        } // Add light border to initial run
        runHistory.pop();
        runHistory.unshift(currentRunLength);
    }
    static { this.MIN_VERSION = 1; }
    static { this.MAX_VERSION = 40; }
    static { this.PENALTY_N1 = 3; }
    static { this.PENALTY_N2 = 3; }
    static { this.PENALTY_N3 = 40; }
    static { this.PENALTY_N4 = 10; }
    static { this.ECC_CODEWORDS_PER_BLOCK = [
        // Version: (note that index 0 is for padding, and is set to an illegal value)
        //0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
        [
            -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30,
            30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30
        ],
        [
            -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28,
            28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28
        ],
        [
            -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30,
            30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30
        ],
        [
            -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30,
            30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30
        ] // High
    ]; }
    static { this.NUM_ERROR_CORRECTION_BLOCKS = [
        // Version: (note that index 0 is for padding, and is set to an illegal value)
        //0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
        [
            -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18,
            19, 19, 20, 21, 22, 24, 25
        ],
        [
            -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31,
            33, 35, 37, 38, 40, 43, 45, 47, 49
        ],
        [
            -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40,
            43, 45, 48, 51, 53, 56, 59, 62, 65, 68
        ],
        [
            -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48,
            51, 54, 57, 60, 63, 66, 70, 74, 77, 81
        ] // High
    ]; }
}
function appendBits(val, len, bb) {
    if (len < 0 || len > 31 || val >>> len != 0) {
        throw new RangeError('Value out of range');
    }
    for (let i = len - 1; i >= 0; i--) {
        bb.push((val >>> i) & 1);
    }
}
function getBit(x, i) {
    return ((x >>> i) & 1) != 0;
}
function assert(cond) {
    if (!cond) {
        throw new Error('Assertion error');
    }
}
class QrSegment {
    static makeBytes(data) {
        let bb = [];
        for (const b of data) {
            appendBits(b, 8, bb);
        }
        return new QrSegment(Mode.BYTE, data.length, bb);
    }
    static makeNumeric(digits) {
        if (!QrSegment.isNumeric(digits)) {
            throw new RangeError('String contains non-numeric characters');
        }
        let bb = [];
        for (let i = 0; i < digits.length;) {
            const n = Math.min(digits.length - i, 3);
            appendBits(parseInt(digits.substring(i, i + n), 10), n * 3 + 1, bb);
            i += n;
        }
        return new QrSegment(Mode.NUMERIC, digits.length, bb);
    }
    static makeAlphanumeric(text) {
        if (!QrSegment.isAlphanumeric(text)) {
            throw new RangeError('String contains unencodable characters in alphanumeric mode');
        }
        let bb = [];
        let i;
        for (i = 0; i + 2 <= text.length; i += 2) {
            let temp = QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
            temp += QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
            appendBits(temp, 11, bb);
        }
        if (i < text.length) {
            appendBits(QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bb);
        }
        return new QrSegment(Mode.ALPHANUMERIC, text.length, bb);
    }
    static makeSegments(text) {
        if (text == '') {
            return [];
        }
        else if (QrSegment.isNumeric(text)) {
            return [QrSegment.makeNumeric(text)];
        }
        else if (QrSegment.isAlphanumeric(text)) {
            return [QrSegment.makeAlphanumeric(text)];
        }
        else {
            return [QrSegment.makeBytes(QrSegment.toUtf8ByteArray(text))];
        }
    }
    static makeEci(assignVal) {
        let bb = [];
        if (assignVal < 0) {
            throw new RangeError('ECI assignment value out of range');
        }
        else if (assignVal < 1 << 7) {
            appendBits(assignVal, 8, bb);
        }
        else if (assignVal < 1 << 14) {
            appendBits(0b10, 2, bb);
            appendBits(assignVal, 14, bb);
        }
        else if (assignVal < 1000000) {
            appendBits(0b110, 3, bb);
            appendBits(assignVal, 21, bb);
        }
        else {
            throw new RangeError('ECI assignment value out of range');
        }
        return new QrSegment(Mode.ECI, 0, bb);
    }
    static isNumeric(text) {
        return QrSegment.NUMERIC_REGEX.test(text);
    }
    static isAlphanumeric(text) {
        return QrSegment.ALPHANUMERIC_REGEX.test(text);
    }
    constructor(mode, numChars, bitData) {
        this.mode = mode;
        this.numChars = numChars;
        this.bitData = bitData;
        if (numChars < 0) {
            throw new RangeError('Invalid argument');
        }
        this.bitData = bitData.slice();
    }
    getData() {
        return this.bitData.slice();
    }
    static getTotalBits(segs, version) {
        let result = 0;
        for (const seg of segs) {
            const ccbits = seg.mode.numCharCountBits(version);
            if (seg.numChars >= 1 << ccbits) {
                return Infinity;
            }
            result += 4 + ccbits + seg.bitData.length;
        }
        return result;
    }
    static toUtf8ByteArray(str) {
        str = encodeURI(str);
        let result = [];
        for (let i = 0; i < str.length; i++) {
            if (str.charAt(i) != '%') {
                result.push(str.charCodeAt(i));
            }
            else {
                result.push(parseInt(str.substring(i + 1, i + 3), 16));
                i += 2;
            }
        }
        return result;
    }
    static { this.NUMERIC_REGEX = /^[0-9]*$/; }
    static { this.ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+.\/:-]*$/; }
    static { this.ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'; }
}
class Ecc {
    static { this.LOW = new Ecc(0, 1); } // The QR Code can tolerate about  7% erroneous codewords
    static { this.MEDIUM = new Ecc(1, 0); } // The QR Code can tolerate about 15% erroneous codewords
    static { this.QUARTILE = new Ecc(2, 3); } // The QR Code can tolerate about 25% erroneous codewords
    static { this.HIGH = new Ecc(3, 2); } // The QR Code can tolerate about 30% erroneous codewords
    static { this.low = this.LOW; }
    static { this.medium = this.MEDIUM; }
    static { this.quartile = this.QUARTILE; }
    static { this.high = this.HIGH; }
    constructor(ordinal, formatBits) {
        this.ordinal = ordinal;
        this.formatBits = formatBits;
    }
}
class Mode {
    static { this.NUMERIC = new Mode(0x1, [10, 12, 14]); }
    static { this.ALPHANUMERIC = new Mode(0x2, [9, 11, 13]); }
    static { this.BYTE = new Mode(0x4, [8, 16, 16]); }
    static { this.KANJI = new Mode(0x8, [8, 10, 12]); }
    static { this.ECI = new Mode(0x7, [0, 0, 0]); }
    constructor(modeBits, numBitsCharCount) {
        this.modeBits = modeBits;
        this.numBitsCharCount = numBitsCharCount;
    }
    numCharCountBits(ver) {
        return this.numBitsCharCount[Math.floor((ver + 7) / 17)];
    }
}
export { QrCode, Ecc };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXJjb2RlLWdlbmVyYXRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3Byb2plY3RzL25nLXFyY29kZS1zdmcvc3JjL2xpYi9xcmNvZGUtZ2VuZXJhdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FxQkc7QUFNSCxNQUFNLE1BQU07SUFDRCxNQUFNLENBQUMsVUFBVSxDQUFDLElBQVksRUFBRSxHQUFRO1FBQzNDLE1BQU0sSUFBSSxHQUFxQixTQUFTLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVELE9BQU8sTUFBTSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVNLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBMkIsRUFBRSxHQUFRO1FBQzVELE1BQU0sR0FBRyxHQUFjLFNBQVMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakQsT0FBTyxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVNLE1BQU0sQ0FBQyxjQUFjLENBQ3hCLElBQWdDLEVBQ2hDLEdBQVEsRUFDUixhQUFrQixDQUFDLEVBQ25CLGFBQWtCLEVBQUUsRUFDcEIsT0FBWSxDQUFDLENBQUMsRUFDZCxXQUFvQixJQUFJO1FBRXhCLElBQ0ksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxXQUFXLElBQUksVUFBVSxJQUFJLFVBQVUsSUFBSSxVQUFVLElBQUksVUFBVSxJQUFJLE1BQU0sQ0FBQyxXQUFXLENBQUM7WUFDbkcsSUFBSSxHQUFHLENBQUMsQ0FBQztZQUNULElBQUksR0FBRyxDQUFDLEVBQ1Y7WUFDRSxNQUFNLElBQUksVUFBVSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1NBQ3pDO1FBRUQsSUFBSSxPQUFZLENBQUM7UUFDakIsSUFBSSxZQUFpQixDQUFDO1FBQ3RC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LEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtTQUNqRDtRQUNEO1lBQ0ksQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO1lBQzlHLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7U0FDckQ7UUFDRDtZQUNJLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtZQUM5RyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO1NBQ3JEO1FBQ0Q7WUFDSSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7WUFDOUcsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtTQUNyRCxDQUFDLE9BQU87S0FDWixBQW5COEMsQ0FtQjdDO2FBRXNCLGdDQUEyQixHQUFzQjtRQUNyRSw4RUFBOEU7UUFDOUUsbUxBQW1MO1FBQ25MO1lBQ0ksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO1lBQy9HLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7U0FDN0I7UUFDRDtZQUNJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7WUFDaEgsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO1NBQ3JDO1FBQ0Q7WUFDSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7WUFDL0csRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVB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QUMsR0FBUTtRQUM1QixPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsQ0FBQzs7QUFHTCxPQUFPLEVBQUMsTUFBTSxFQUFFLEdBQUcsRUFBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLypcclxuICogUVIgQ29kZSBnZW5lcmF0b3IgbGlicmFyeSAoVHlwZVNjcmlwdClcclxuICpcclxuICogQ29weXJpZ2h0IChjKSBQcm9qZWN0IE5heXVraS4gKE1JVCBMaWNlbnNlKVxyXG4gKiBodHRwczovL3d3dy5uYXl1a2kuaW8vcGFnZS9xci1jb2RlLWdlbmVyYXRvci1saWJyYXJ5XHJcbiAqXHJcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHkgb2ZcclxuICogdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpblxyXG4gKiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvXHJcbiAqIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mXHJcbiAqIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbyxcclxuICogc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XHJcbiAqIC0gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cclxuICogICBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cclxuICogLSBUaGUgU29mdHdhcmUgaXMgcHJvdmlkZWQgXCJhcyBpc1wiLCB3aXRob3V0IHdhcnJhbnR5IG9mIGFueSBraW5kLCBleHByZXNzIG9yXHJcbiAqICAgaW1wbGllZCwgaW5jbHVkaW5nIGJ1dCBub3QgbGltaXRlZCB0byB0aGUgd2FycmFudGllcyBvZiBtZXJjaGFudGFiaWxpdHksXHJcbiAqICAgZml0bmVzcyBmb3IgYSBwYXJ0aWN1bGFyIHB1cnBvc2UgYW5kIG5vbmluZnJpbmdlbWVudC4gSW4gbm8gZXZlbnQgc2hhbGwgdGhlXHJcbiAqICAgYXV0aG9ycyBvciBjb3B5cmlnaHQgaG9sZGVycyBiZSBsaWFibGUgZm9yIGFueSBjbGFpbSwgZGFtYWdlcyBvciBvdGhlclxyXG4gKiAgIGxpYWJpbGl0eSwgd2hldGhlciBpbiBhbiBhY3Rpb24gb2YgY29udHJhY3QsIHRvcnQgb3Igb3RoZXJ3aXNlLCBhcmlzaW5nIGZyb20sXHJcbiAqICAgb3V0IG9mIG9yIGluIGNvbm5lY3Rpb24gd2l0aCB0aGUgU29mdHdhcmUgb3IgdGhlIHVzZSBvciBvdGhlciBkZWFsaW5ncyBpbiB0aGVcclxuICogICBTb2Z0d2FyZS5cclxuICovXHJcblxyXG50eXBlIGJpdCA9IG51bWJlcjtcclxudHlwZSBieXRlID0gbnVtYmVyO1xyXG50eXBlIGludCA9IG51bWJlcjtcclxuXHJcbmNsYXNzIFFyQ29kZSB7XHJcbiAgICBwdWJsaWMgc3RhdGljIGVuY29kZVRleHQodGV4dDogc3RyaW5nLCBlY2w6IEVjYyk6IFFyQ29kZSB7XHJcbiAgICAgICAgY29uc3Qgc2VnczogQXJyYXk8UXJTZWdtZW50PiA9IFFyU2VnbWVudC5tYWtlU2VnbWVudHModGV4dCk7XHJcbiAgICAgICAgcmV0dXJuIFFyQ29kZS5lbmNvZGVTZWdtZW50cyhzZWdzLCBlY2wpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgZW5jb2RlQmluYXJ5KGRhdGE6IFJlYWRvbmx5PEFycmF5PGJ5dGU+PiwgZWNsOiBFY2MpOiBRckNvZGUge1xyXG4gICAgICAgIGNvbnN0IHNlZzogUXJTZWdtZW50ID0gUXJTZWdtZW50Lm1ha2VCeXRlcyhkYXRhKTtcclxuICAgICAgICByZXR1cm4gUXJDb2RlLmVuY29kZVNlZ21lbnRzKFtzZWddLCBlY2wpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgZW5jb2RlU2VnbWVudHMoXHJcbiAgICAgICAgc2VnczogUmVhZG9ubHk8QXJyYXk8UXJTZWdtZW50Pj4sXHJcbiAgICAgICAgZWNsOiBFY2MsXHJcbiAgICAgICAgbWluVmVyc2lvbjogaW50ID0gMSxcclxuICAgICAgICBtYXhWZXJzaW9uOiBpbnQgPSA0MCxcclxuICAgICAgICBtYXNrOiBpbnQgPSAtMSxcclxuICAgICAgICBib29zdEVjbDogYm9vbGVhbiA9IHRydWVcclxuICAgICk6IFFyQ29kZSB7XHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAhKFFyQ29kZS5NSU5fVkVSU0lPTiA8PSBtaW5WZXJzaW9uICYmIG1pblZlcnNpb24gPD0gbWF4VmVyc2lvbiAmJiBtYXhWZXJzaW9uIDw9IFFyQ29kZS5NQVhfVkVSU0lPTikgfHxcclxuICAgICAgICAgICAgbWFzayA8IC0xIHx8XHJcbiAgICAgICAgICAgIG1hc2sgPiA3XHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdJbnZhbGlkIHZhbHVlJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgdmVyc2lvbjogaW50O1xyXG4gICAgICAgIGxldCBkYXRhVXNlZEJpdHM6IGludDtcclxuICAgICAgICBmb3IgKHZlcnNpb24gPSBtaW5WZXJzaW9uOyA7IHZlcnNpb24rKykge1xyXG4gICAgICAgICAgICBjb25zdCBkYXRhQ2FwYWNpdHlCaXRzOiBpbnQgPSBRckNvZGUuZ2V0TnVtRGF0YUNvZGV3b3Jkcyh2ZXJzaW9uLCBlY2wpICogODtcclxuICAgICAgICAgICAgY29uc3QgdXNlZEJpdHM6IG51bWJlciA9IFFyU2VnbWVudC5nZXRUb3RhbEJpdHMoc2VncywgdmVyc2lvbik7XHJcbiAgICAgICAgICAgIGlmICh1c2VkQml0cyA8PSBkYXRhQ2FwYWNpdHlCaXRzKSB7XHJcbiAgICAgICAgICAgICAgICBkYXRhVXNlZEJpdHMgPSB1c2VkQml0cztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh2ZXJzaW9uID49IG1heFZlcnNpb24pIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdEYXRhIHRvbyBsb25nJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgbmV3RWNsIG9mIFtFY2MuTUVESVVNLCBFY2MuUVVBUlRJTEUsIEVjYy5ISUdIXSkge1xyXG4gICAgICAgICAgICBpZiAoYm9vc3RFY2wgJiYgZGF0YVVzZWRCaXRzIDw9IFFyQ29kZS5nZXROdW1EYXRhQ29kZXdvcmRzKHZlcnNpb24sIG5ld0VjbCkgKiA4KSB7XHJcbiAgICAgICAgICAgICAgICBlY2wgPSBuZXdFY2w7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBiYjogQXJyYXk8Yml0PiA9IFtdO1xyXG4gICAgICAgIGZvciAoY29uc3Qgc2VnIG9mIHNlZ3MpIHtcclxuICAgICAgICAgICAgYXBwZW5kQml0cyhzZWcubW9kZS5tb2RlQml0cywgNCwgYmIpO1xyXG4gICAgICAgICAgICBhcHBlbmRCaXRzKHNlZy5udW1DaGFycywgc2VnLm1vZGUubnVtQ2hhckNvdW50Qml0cyh2ZXJzaW9uKSwgYmIpO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGIgb2Ygc2VnLmdldERhdGEoKSkge1xyXG4gICAgICAgICAgICAgICAgYmIucHVzaChiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBhc3NlcnQoYmIubGVuZ3RoID09IGRhdGFVc2VkQml0cyk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRhdGFDYXBhY2l0eUJpdHM6IGludCA9IFFyQ29kZS5nZXROdW1EYXRhQ29kZXdvcmRzKHZlcnNpb24sIGVjbCkgKiA4O1xyXG4gICAgICAgIGFzc2VydChiYi5sZW5ndGggPD0gZGF0YUNhcGFjaXR5Qml0cyk7XHJcbiAgICAgICAgYXBwZW5kQml0cygwLCBNYXRoLm1pbig0LCBkYXRhQ2FwYWNpdHlCaXRzIC0gYmIubGVuZ3RoKSwgYmIpO1xyXG4gICAgICAgIGFwcGVuZEJpdHMoMCwgKDggLSAoYmIubGVuZ3RoICUgOCkpICUgOCwgYmIpO1xyXG4gICAgICAgIGFzc2VydChiYi5sZW5ndGggJSA4ID09IDApO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBwYWRCeXRlID0gMHhlYzsgYmIubGVuZ3RoIDwgZGF0YUNhcGFjaXR5Qml0czsgcGFkQnl0ZSBePSAweGVjIF4gMHgxMSkge1xyXG4gICAgICAgICAgICBhcHBlbmRCaXRzKHBhZEJ5dGUsIDgsIGJiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBkYXRhQ29kZXdvcmRzOiBBcnJheTxieXRlPiA9IFtdO1xyXG4gICAgICAgIHdoaWxlIChkYXRhQ29kZXdvcmRzLmxlbmd0aCAqIDggPCBiYi5sZW5ndGgpIHtcclxuICAgICAgICAgICAgZGF0YUNvZGV3b3Jkcy5wdXNoKDApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBiYi5mb3JFYWNoKChiOiBiaXQsIGk6IGludCkgPT4gKGRhdGFDb2Rld29yZHNbaSA+Pj4gM10gfD0gYiA8PCAoNyAtIChpICYgNykpKSk7XHJcblxyXG4gICAgICAgIHJldHVybiBuZXcgUXJDb2RlKHZlcnNpb24sIGVjbCwgZGF0YUNvZGV3b3JkcywgbWFzayk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHJlYWRvbmx5IHNpemU6IGludDtcclxuICAgIHB1YmxpYyByZWFkb25seSBtYXNrOiBpbnQ7XHJcblxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBtb2R1bGVzOiBBcnJheTxBcnJheTxib29sZWFuPj4gPSBbXTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaXNGdW5jdGlvbjogQXJyYXk8QXJyYXk8Ym9vbGVhbj4+ID0gW107XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIHB1YmxpYyByZWFkb25seSB2ZXJzaW9uOiBpbnQsXHJcbiAgICAgICAgcHVibGljIHJlYWRvbmx5IGVycm9yQ29ycmVjdGlvbkxldmVsOiBFY2MsXHJcbiAgICAgICAgZGF0YUNvZGV3b3JkczogUmVhZG9ubHk8QXJyYXk8Ynl0ZT4+LFxyXG4gICAgICAgIG1zazogaW50XHJcbiAgICApIHtcclxuICAgICAgICBpZiAodmVyc2lvbiA8IFFyQ29kZS5NSU5fVkVSU0lPTiB8fCB2ZXJzaW9uID4gUXJDb2RlLk1BWF9WRVJTSU9OKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdWZXJzaW9uIHZhbHVlIG91dCBvZiByYW5nZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobXNrIDwgLTEgfHwgbXNrID4gNykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignTWFzayB2YWx1ZSBvdXQgb2YgcmFuZ2UnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zaXplID0gdmVyc2lvbiAqIDQgKyAxNztcclxuXHJcbiAgICAgICAgbGV0IHJvdzogQXJyYXk8Ym9vbGVhbj4gPSBbXTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc2l6ZTsgaSsrKSB7XHJcbiAgICAgICAgICAgIHJvdy5wdXNoKGZhbHNlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnNpemU7IGkrKykge1xyXG4gICAgICAgICAgICB0aGlzLm1vZHVsZXMucHVzaChyb3cuc2xpY2UoKSk7XHJcbiAgICAgICAgICAgIHRoaXMuaXNGdW5jdGlvbi5wdXNoKHJvdy5zbGljZSgpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZHJhd0Z1bmN0aW9uUGF0dGVybnMoKTtcclxuICAgICAgICBjb25zdCBhbGxDb2Rld29yZHM6IEFycmF5PGJ5dGU+ID0gdGhpcy5hZGRFY2NBbmRJbnRlcmxlYXZlKGRhdGFDb2Rld29yZHMpO1xyXG4gICAgICAgIHRoaXMuZHJhd0NvZGV3b3JkcyhhbGxDb2Rld29yZHMpO1xyXG5cclxuICAgICAgICBpZiAobXNrID09IC0xKSB7XHJcbiAgICAgICAgICAgIGxldCBtaW5QZW5hbHR5OiBpbnQgPSAxMDAwMDAwMDAwO1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hcHBseU1hc2soaSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdGb3JtYXRCaXRzKGkpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGVuYWx0eTogaW50ID0gdGhpcy5nZXRQZW5hbHR5U2NvcmUoKTtcclxuICAgICAgICAgICAgICAgIGlmIChwZW5hbHR5IDwgbWluUGVuYWx0eSkge1xyXG4gICAgICAgICAgICAgICAgICAgIG1zayA9IGk7XHJcbiAgICAgICAgICAgICAgICAgICAgbWluUGVuYWx0eSA9IHBlbmFsdHk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFwcGx5TWFzayhpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBhc3NlcnQoMCA8PSBtc2sgJiYgbXNrIDw9IDcpO1xyXG4gICAgICAgIHRoaXMubWFzayA9IG1zaztcclxuICAgICAgICB0aGlzLmFwcGx5TWFzayhtc2spO1xyXG4gICAgICAgIHRoaXMuZHJhd0Zvcm1hdEJpdHMobXNrKTtcclxuXHJcbiAgICAgICAgdGhpcy5pc0Z1bmN0aW9uID0gW107XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGdldE1vZHVsZSh4OiBpbnQsIHk6IGludCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiAwIDw9IHggJiYgeCA8IHRoaXMuc2l6ZSAmJiAwIDw9IHkgJiYgeSA8IHRoaXMuc2l6ZSAmJiB0aGlzLm1vZHVsZXNbeV1beF07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3RnVuY3Rpb25QYXR0ZXJucygpOiB2b2lkIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc2l6ZTsgaSsrKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0RnVuY3Rpb25Nb2R1bGUoNiwgaSwgaSAlIDIgPT0gMCk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0RnVuY3Rpb25Nb2R1bGUoaSwgNiwgaSAlIDIgPT0gMCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmRyYXdGaW5kZXJQYXR0ZXJuKDMsIDMpO1xyXG4gICAgICAgIHRoaXMuZHJhd0ZpbmRlclBhdHRlcm4odGhpcy5zaXplIC0gNCwgMyk7XHJcbiAgICAgICAgdGhpcy5kcmF3RmluZGVyUGF0dGVybigzLCB0aGlzLnNpemUgLSA0KTtcclxuXHJcbiAgICAgICAgY29uc3QgYWxpZ25QYXRQb3M6IEFycmF5PGludD4gPSB0aGlzLmdldEFsaWdubWVudFBhdHRlcm5Qb3NpdGlvbnMoKTtcclxuICAgICAgICBjb25zdCBudW1BbGlnbjogaW50ID0gYWxpZ25QYXRQb3MubGVuZ3RoO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbnVtQWxpZ247IGkrKykge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IG51bUFsaWduOyBqKyspIHtcclxuICAgICAgICAgICAgICAgIGlmICghKChpID09IDAgJiYgaiA9PSAwKSB8fCAoaSA9PSAwICYmIGogPT0gbnVtQWxpZ24gLSAxKSB8fCAoaSA9PSBudW1BbGlnbiAtIDEgJiYgaiA9PSAwKSkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYXdBbGlnbm1lbnRQYXR0ZXJuKGFsaWduUGF0UG9zW2ldLCBhbGlnblBhdFBvc1tqXSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZHJhd0Zvcm1hdEJpdHMoMCk7XHJcbiAgICAgICAgdGhpcy5kcmF3VmVyc2lvbigpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0Zvcm1hdEJpdHMobWFzazogaW50KTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZGF0YTogaW50ID0gKHRoaXMuZXJyb3JDb3JyZWN0aW9uTGV2ZWwuZm9ybWF0Qml0cyA8PCAzKSB8IG1hc2s7XHJcbiAgICAgICAgbGV0IHJlbTogaW50ID0gZGF0YTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDEwOyBpKyspIHtcclxuICAgICAgICAgICAgcmVtID0gKHJlbSA8PCAxKSBeICgocmVtID4+PiA5KSAqIDB4NTM3KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgYml0cyA9ICgoZGF0YSA8PCAxMCkgfCByZW0pIF4gMHg1NDEyO1xyXG4gICAgICAgIGFzc2VydChiaXRzID4+PiAxNSA9PSAwKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPD0gNTsgaSsrKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0RnVuY3Rpb25Nb2R1bGUoOCwgaSwgZ2V0Qml0KGJpdHMsIGkpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zZXRGdW5jdGlvbk1vZHVsZSg4LCA3LCBnZXRCaXQoYml0cywgNikpO1xyXG4gICAgICAgIHRoaXMuc2V0RnVuY3Rpb25Nb2R1bGUoOCwgOCwgZ2V0Qml0KGJpdHMsIDcpKTtcclxuICAgICAgICB0aGlzLnNldEZ1bmN0aW9uTW9kdWxlKDcsIDgsIGdldEJpdChiaXRzLCA4KSk7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDk7IGkgPCAxNTsgaSsrKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0RnVuY3Rpb25Nb2R1bGUoMTQgLSBpLCA4LCBnZXRCaXQoYml0cywgaSkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA4OyBpKyspIHtcclxuICAgICAgICAgICAgdGhpcy5zZXRGdW5jdGlvbk1vZHVsZSh0aGlzLnNpemUgLSAxIC0gaSwgOCwgZ2V0Qml0KGJpdHMsIGkpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDg7IGkgPCAxNTsgaSsrKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0RnVuY3Rpb25Nb2R1bGUoOCwgdGhpcy5zaXplIC0gMTUgKyBpLCBnZXRCaXQoYml0cywgaSkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnNldEZ1bmN0aW9uTW9kdWxlKDgsIHRoaXMuc2l6ZSAtIDgsIHRydWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1ZlcnNpb24oKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMudmVyc2lvbiA8IDcpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHJlbTogaW50ID0gdGhpcy52ZXJzaW9uO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMTI7IGkrKykge1xyXG4gICAgICAgICAgICByZW0gPSAocmVtIDw8IDEpIF4gKChyZW0gPj4+IDExKSAqIDB4MWYyNSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGJpdHM6IGludCA9ICh0aGlzLnZlcnNpb24gPDwgMTIpIHwgcmVtOyAvLyB1aW50MThcclxuICAgICAgICBhc3NlcnQoYml0cyA+Pj4gMTggPT0gMCk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMTg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xvcjogYm9vbGVhbiA9IGdldEJpdChiaXRzLCBpKTtcclxuICAgICAgICAgICAgY29uc3QgYTogaW50ID0gdGhpcy5zaXplIC0gMTEgKyAoaSAlIDMpO1xyXG4gICAgICAgICAgICBjb25zdCBiOiBpbnQgPSBNYXRoLmZsb29yKGkgLyAzKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRGdW5jdGlvbk1vZHVsZShhLCBiLCBjb2xvcik7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0RnVuY3Rpb25Nb2R1bGUoYiwgYSwgY29sb3IpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdGaW5kZXJQYXR0ZXJuKHg6IGludCwgeTogaW50KTogdm9pZCB7XHJcbiAgICAgICAgZm9yIChsZXQgZHkgPSAtNDsgZHkgPD0gNDsgZHkrKykge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBkeCA9IC00OyBkeCA8PSA0OyBkeCsrKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkaXN0OiBpbnQgPSBNYXRoLm1heChNYXRoLmFicyhkeCksIE1hdGguYWJzKGR5KSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB4eDogaW50ID0geCArIGR4O1xyXG4gICAgICAgICAgICAgICAgY29uc3QgeXk6IGludCA9IHkgKyBkeTtcclxuICAgICAgICAgICAgICAgIGlmICgwIDw9IHh4ICYmIHh4IDwgdGhpcy5zaXplICYmIDAgPD0geXkgJiYgeXkgPCB0aGlzLnNpemUpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldEZ1bmN0aW9uTW9kdWxlKHh4LCB5eSwgZGlzdCAhPSAyICYmIGRpc3QgIT0gNCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3QWxpZ25tZW50UGF0dGVybih4OiBpbnQsIHk6IGludCk6IHZvaWQge1xyXG4gICAgICAgIGZvciAobGV0IGR5ID0gLTI7IGR5IDw9IDI7IGR5KyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgZHggPSAtMjsgZHggPD0gMjsgZHgrKykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRGdW5jdGlvbk1vZHVsZSh4ICsgZHgsIHkgKyBkeSwgTWF0aC5tYXgoTWF0aC5hYnMoZHgpLCBNYXRoLmFicyhkeSkpICE9IDEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0RnVuY3Rpb25Nb2R1bGUoeDogaW50LCB5OiBpbnQsIGlzRGFyazogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMubW9kdWxlc1t5XVt4XSA9IGlzRGFyaztcclxuICAgICAgICB0aGlzLmlzRnVuY3Rpb25beV1beF0gPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYWRkRWNjQW5kSW50ZXJsZWF2ZShkYXRhOiBSZWFkb25seTxBcnJheTxieXRlPj4pOiBBcnJheTxieXRlPiB7XHJcbiAgICAgICAgY29uc3QgdmVyOiBpbnQgPSB0aGlzLnZlcnNpb247XHJcbiAgICAgICAgY29uc3QgZWNsOiBFY2MgPSB0aGlzLmVycm9yQ29ycmVjdGlvbkxldmVsO1xyXG4gICAgICAgIGlmIChkYXRhLmxlbmd0aCAhPSBRckNvZGUuZ2V0TnVtRGF0YUNvZGV3b3Jkcyh2ZXIsIGVjbCkpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0ludmFsaWQgYXJndW1lbnQnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG51bUJsb2NrczogaW50ID0gUXJDb2RlLk5VTV9FUlJPUl9DT1JSRUNUSU9OX0JMT0NLU1tlY2wub3JkaW5hbF1bdmVyXTtcclxuICAgICAgICBjb25zdCBibG9ja0VjY0xlbjogaW50ID0gUXJDb2RlLkVDQ19DT0RFV09SRFNfUEVSX0JMT0NLW2VjbC5vcmRpbmFsXVt2ZXJdO1xyXG4gICAgICAgIGNvbnN0IHJhd0NvZGV3b3JkczogaW50ID0gTWF0aC5mbG9vcihRckNvZGUuZ2V0TnVtUmF3RGF0YU1vZHVsZXModmVyKSAvIDgpO1xyXG4gICAgICAgIGNvbnN0IG51bVNob3J0QmxvY2tzOiBpbnQgPSBudW1CbG9ja3MgLSAocmF3Q29kZXdvcmRzICUgbnVtQmxvY2tzKTtcclxuICAgICAgICBjb25zdCBzaG9ydEJsb2NrTGVuOiBpbnQgPSBNYXRoLmZsb29yKHJhd0NvZGV3b3JkcyAvIG51bUJsb2Nrcyk7XHJcblxyXG4gICAgICAgIGxldCBibG9ja3M6IEFycmF5PEFycmF5PGJ5dGU+PiA9IFtdO1xyXG4gICAgICAgIGNvbnN0IHJzRGl2OiBBcnJheTxieXRlPiA9IFFyQ29kZS5yZWVkU29sb21vbkNvbXB1dGVEaXZpc29yKGJsb2NrRWNjTGVuKTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMCwgayA9IDA7IGkgPCBudW1CbG9ja3M7IGkrKykge1xyXG4gICAgICAgICAgICBsZXQgZGF0OiBBcnJheTxieXRlPiA9IGRhdGEuc2xpY2UoaywgayArIHNob3J0QmxvY2tMZW4gLSBibG9ja0VjY0xlbiArIChpIDwgbnVtU2hvcnRCbG9ja3MgPyAwIDogMSkpO1xyXG4gICAgICAgICAgICBrICs9IGRhdC5sZW5ndGg7XHJcbiAgICAgICAgICAgIGNvbnN0IGVjYzogQXJyYXk8Ynl0ZT4gPSBRckNvZGUucmVlZFNvbG9tb25Db21wdXRlUmVtYWluZGVyKGRhdCwgcnNEaXYpO1xyXG4gICAgICAgICAgICBpZiAoaSA8IG51bVNob3J0QmxvY2tzKSB7XHJcbiAgICAgICAgICAgICAgICBkYXQucHVzaCgwKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBibG9ja3MucHVzaChkYXQuY29uY2F0KGVjYykpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHJlc3VsdDogQXJyYXk8Ynl0ZT4gPSBbXTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJsb2Nrc1swXS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBibG9ja3MuZm9yRWFjaCgoYmxvY2ssIGopID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChpICE9IHNob3J0QmxvY2tMZW4gLSBibG9ja0VjY0xlbiB8fCBqID49IG51bVNob3J0QmxvY2tzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goYmxvY2tbaV0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXNzZXJ0KHJlc3VsdC5sZW5ndGggPT0gcmF3Q29kZXdvcmRzKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0NvZGV3b3JkcyhkYXRhOiBSZWFkb25seTxBcnJheTxieXRlPj4pOiB2b2lkIHtcclxuICAgICAgICBpZiAoZGF0YS5sZW5ndGggIT0gTWF0aC5mbG9vcihRckNvZGUuZ2V0TnVtUmF3RGF0YU1vZHVsZXModGhpcy52ZXJzaW9uKSAvIDgpKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdJbnZhbGlkIGFyZ3VtZW50Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGxldCBpOiBpbnQgPSAwO1xyXG4gICAgICAgIGZvciAobGV0IHJpZ2h0ID0gdGhpcy5zaXplIC0gMTsgcmlnaHQgPj0gMTsgcmlnaHQgLT0gMikge1xyXG4gICAgICAgICAgICBpZiAocmlnaHQgPT0gNikge1xyXG4gICAgICAgICAgICAgICAgcmlnaHQgPSA1O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGZvciAobGV0IHZlcnQgPSAwOyB2ZXJ0IDwgdGhpcy5zaXplOyB2ZXJ0KyspIHtcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgMjsgaisrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeDogaW50ID0gcmlnaHQgLSBqO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHVwd2FyZDogYm9vbGVhbiA9ICgocmlnaHQgKyAxKSAmIDIpID09IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeTogaW50ID0gdXB3YXJkID8gdGhpcy5zaXplIC0gMSAtIHZlcnQgOiB2ZXJ0O1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5pc0Z1bmN0aW9uW3ldW3hdICYmIGkgPCBkYXRhLmxlbmd0aCAqIDgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5tb2R1bGVzW3ldW3hdID0gZ2V0Qml0KGRhdGFbaSA+Pj4gM10sIDcgLSAoaSAmIDcpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBhc3NlcnQoaSA9PSBkYXRhLmxlbmd0aCAqIDgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXBwbHlNYXNrKG1hc2s6IGludCk6IHZvaWQge1xyXG4gICAgICAgIGlmIChtYXNrIDwgMCB8fCBtYXNrID4gNykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignTWFzayB2YWx1ZSBvdXQgb2YgcmFuZ2UnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yIChsZXQgeSA9IDA7IHkgPCB0aGlzLnNpemU7IHkrKykge1xyXG4gICAgICAgICAgICBmb3IgKGxldCB4ID0gMDsgeCA8IHRoaXMuc2l6ZTsgeCsrKSB7XHJcbiAgICAgICAgICAgICAgICBsZXQgaW52ZXJ0OiBib29sZWFuO1xyXG4gICAgICAgICAgICAgICAgc3dpdGNoIChtYXNrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAwOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnZlcnQgPSAoeCArIHkpICUgMiA9PSAwO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGludmVydCA9IHkgJSAyID09IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgICAgICAgICAgICAgICAgaW52ZXJ0ID0geCAlIDMgPT0gMDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnZlcnQgPSAoeCArIHkpICUgMyA9PSAwO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIDQ6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGludmVydCA9IChNYXRoLmZsb29yKHggLyAzKSArIE1hdGguZmxvb3IoeSAvIDIpKSAlIDIgPT0gMDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSA1OlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnZlcnQgPSAoKHggKiB5KSAlIDIpICsgKCh4ICogeSkgJSAzKSA9PSAwO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIDY6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGludmVydCA9ICgoKHggKiB5KSAlIDIpICsgKCh4ICogeSkgJSAzKSkgJSAyID09IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgNzpcclxuICAgICAgICAgICAgICAgICAgICAgICAgaW52ZXJ0ID0gKCgoeCArIHkpICUgMikgKyAoKHggKiB5KSAlIDMpKSAlIDIgPT0gMDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbnJlYWNoYWJsZScpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmlzRnVuY3Rpb25beV1beF0gJiYgaW52ZXJ0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tb2R1bGVzW3ldW3hdID0gIXRoaXMubW9kdWxlc1t5XVt4XTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldFBlbmFsdHlTY29yZSgpOiBpbnQge1xyXG4gICAgICAgIGxldCByZXN1bHQ6IGludCA9IDA7XHJcblxyXG4gICAgICAgIGZvciAobGV0IHkgPSAwOyB5IDwgdGhpcy5zaXplOyB5KyspIHtcclxuICAgICAgICAgICAgbGV0IHJ1bkNvbG9yID0gZmFsc2U7XHJcbiAgICAgICAgICAgIGxldCBydW5YID0gMDtcclxuICAgICAgICAgICAgbGV0IHJ1bkhpc3RvcnkgPSBbMCwgMCwgMCwgMCwgMCwgMCwgMF07XHJcbiAgICAgICAgICAgIGZvciAobGV0IHggPSAwOyB4IDwgdGhpcy5zaXplOyB4KyspIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLm1vZHVsZXNbeV1beF0gPT0gcnVuQ29sb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICBydW5YKys7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJ1blggPT0gNSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gUXJDb2RlLlBFTkFMVFlfTjE7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChydW5YID4gNSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQrKztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmluZGVyUGVuYWx0eUFkZEhpc3RvcnkocnVuWCwgcnVuSGlzdG9yeSk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFydW5Db2xvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gdGhpcy5maW5kZXJQZW5hbHR5Q291bnRQYXR0ZXJucyhydW5IaXN0b3J5KSAqIFFyQ29kZS5QRU5BTFRZX04zO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBydW5Db2xvciA9IHRoaXMubW9kdWxlc1t5XVt4XTtcclxuICAgICAgICAgICAgICAgICAgICBydW5YID0gMTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXN1bHQgKz0gdGhpcy5maW5kZXJQZW5hbHR5VGVybWluYXRlQW5kQ291bnQocnVuQ29sb3IsIHJ1blgsIHJ1bkhpc3RvcnkpICogUXJDb2RlLlBFTkFMVFlfTjM7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGxldCB4ID0gMDsgeCA8IHRoaXMuc2l6ZTsgeCsrKSB7XHJcbiAgICAgICAgICAgIGxldCBydW5Db2xvciA9IGZhbHNlO1xyXG4gICAgICAgICAgICBsZXQgcnVuWSA9IDA7XHJcbiAgICAgICAgICAgIGxldCBydW5IaXN0b3J5ID0gWzAsIDAsIDAsIDAsIDAsIDAsIDBdO1xyXG4gICAgICAgICAgICBmb3IgKGxldCB5ID0gMDsgeSA8IHRoaXMuc2l6ZTsgeSsrKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5tb2R1bGVzW3ldW3hdID09IHJ1bkNvbG9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcnVuWSsrO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChydW5ZID09IDUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IFFyQ29kZS5QRU5BTFRZX04xO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocnVuWSA+IDUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0Kys7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbmRlclBlbmFsdHlBZGRIaXN0b3J5KHJ1blksIHJ1bkhpc3RvcnkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghcnVuQ29sb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IHRoaXMuZmluZGVyUGVuYWx0eUNvdW50UGF0dGVybnMocnVuSGlzdG9yeSkgKiBRckNvZGUuUEVOQUxUWV9OMztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgcnVuQ29sb3IgPSB0aGlzLm1vZHVsZXNbeV1beF07XHJcbiAgICAgICAgICAgICAgICAgICAgcnVuWSA9IDE7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmVzdWx0ICs9IHRoaXMuZmluZGVyUGVuYWx0eVRlcm1pbmF0ZUFuZENvdW50KHJ1bkNvbG9yLCBydW5ZLCBydW5IaXN0b3J5KSAqIFFyQ29kZS5QRU5BTFRZX04zO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yIChsZXQgeSA9IDA7IHkgPCB0aGlzLnNpemUgLSAxOyB5KyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgeCA9IDA7IHggPCB0aGlzLnNpemUgLSAxOyB4KyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbG9yOiBib29sZWFuID0gdGhpcy5tb2R1bGVzW3ldW3hdO1xyXG4gICAgICAgICAgICAgICAgaWYgKGNvbG9yID09IHRoaXMubW9kdWxlc1t5XVt4ICsgMV0gJiYgY29sb3IgPT0gdGhpcy5tb2R1bGVzW3kgKyAxXVt4XSAmJiBjb2xvciA9PSB0aGlzLm1vZHVsZXNbeSArIDFdW3ggKyAxXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSBRckNvZGUuUEVOQUxUWV9OMjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGRhcms6IGludCA9IDA7XHJcbiAgICAgICAgZm9yIChjb25zdCByb3cgb2YgdGhpcy5tb2R1bGVzKSB7XHJcbiAgICAgICAgICAgIGRhcmsgPSByb3cucmVkdWNlKChzdW0sIGNvbG9yKSA9PiBzdW0gKyAoY29sb3IgPyAxIDogMCksIGRhcmspO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCB0b3RhbDogaW50ID0gdGhpcy5zaXplICogdGhpcy5zaXplO1xyXG4gICAgICAgIGNvbnN0IGs6IGludCA9IE1hdGguY2VpbChNYXRoLmFicyhkYXJrICogMjAgLSB0b3RhbCAqIDEwKSAvIHRvdGFsKSAtIDE7XHJcbiAgICAgICAgYXNzZXJ0KDAgPD0gayAmJiBrIDw9IDkpO1xyXG4gICAgICAgIHJlc3VsdCArPSBrICogUXJDb2RlLlBFTkFMVFlfTjQ7XHJcbiAgICAgICAgYXNzZXJ0KDAgPD0gcmVzdWx0ICYmIHJlc3VsdCA8PSAyNTY4ODg4KTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0QWxpZ25tZW50UGF0dGVyblBvc2l0aW9ucygpOiBBcnJheTxpbnQ+IHtcclxuICAgICAgICBpZiAodGhpcy52ZXJzaW9uID09IDEpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG51bUFsaWduOiBpbnQgPSBNYXRoLmZsb29yKHRoaXMudmVyc2lvbiAvIDcpICsgMjtcclxuICAgICAgICAgICAgY29uc3Qgc3RlcDogaW50ID0gdGhpcy52ZXJzaW9uID09IDMyID8gMjYgOiBNYXRoLmNlaWwoKHRoaXMudmVyc2lvbiAqIDQgKyA0KSAvIChudW1BbGlnbiAqIDIgLSAyKSkgKiAyO1xyXG4gICAgICAgICAgICBsZXQgcmVzdWx0OiBBcnJheTxpbnQ+ID0gWzZdO1xyXG4gICAgICAgICAgICBmb3IgKGxldCBwb3MgPSB0aGlzLnNpemUgLSA3OyByZXN1bHQubGVuZ3RoIDwgbnVtQWxpZ247IHBvcyAtPSBzdGVwKSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHQuc3BsaWNlKDEsIDAsIHBvcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZ2V0TnVtUmF3RGF0YU1vZHVsZXModmVyOiBpbnQpOiBpbnQge1xyXG4gICAgICAgIGlmICh2ZXIgPCBRckNvZGUuTUlOX1ZFUlNJT04gfHwgdmVyID4gUXJDb2RlLk1BWF9WRVJTSU9OKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdWZXJzaW9uIG51bWJlciBvdXQgb2YgcmFuZ2UnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IHJlc3VsdDogaW50ID0gKDE2ICogdmVyICsgMTI4KSAqIHZlciArIDY0O1xyXG4gICAgICAgIGlmICh2ZXIgPj0gMikge1xyXG4gICAgICAgICAgICBjb25zdCBudW1BbGlnbjogaW50ID0gTWF0aC5mbG9vcih2ZXIgLyA3KSArIDI7XHJcbiAgICAgICAgICAgIHJlc3VsdCAtPSAoMjUgKiBudW1BbGlnbiAtIDEwKSAqIG51bUFsaWduIC0gNTU7XHJcbiAgICAgICAgICAgIGlmICh2ZXIgPj0gNykge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0IC09IDM2O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGFzc2VydCgyMDggPD0gcmVzdWx0ICYmIHJlc3VsdCA8PSAyOTY0OCk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyBnZXROdW1EYXRhQ29kZXdvcmRzKHZlcjogaW50LCBlY2w6IEVjYyk6IGludCB7XHJcbiAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgTWF0aC5mbG9vcihRckNvZGUuZ2V0TnVtUmF3RGF0YU1vZHVsZXModmVyKSAvIDgpIC1cclxuICAgICAgICAgICAgUXJDb2RlLkVDQ19DT0RFV09SRFNfUEVSX0JMT0NLW2VjbC5vcmRpbmFsXVt2ZXJdICogUXJDb2RlLk5VTV9FUlJPUl9DT1JSRUNUSU9OX0JMT0NLU1tlY2wub3JkaW5hbF1bdmVyXVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVlZFNvbG9tb25Db21wdXRlRGl2aXNvcihkZWdyZWU6IGludCk6IEFycmF5PGJ5dGU+IHtcclxuICAgICAgICBpZiAoZGVncmVlIDwgMSB8fCBkZWdyZWUgPiAyNTUpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0RlZ3JlZSBvdXQgb2YgcmFuZ2UnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IHJlc3VsdDogQXJyYXk8Ynl0ZT4gPSBbXTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRlZ3JlZSAtIDE7IGkrKykge1xyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVzdWx0LnB1c2goMSk7XHJcblxyXG4gICAgICAgIGxldCByb290ID0gMTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRlZ3JlZTsgaSsrKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgcmVzdWx0Lmxlbmd0aDsgaisrKSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHRbal0gPSBRckNvZGUucmVlZFNvbG9tb25NdWx0aXBseShyZXN1bHRbal0sIHJvb3QpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGogKyAxIDwgcmVzdWx0Lmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdFtqXSBePSByZXN1bHRbaiArIDFdO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJvb3QgPSBRckNvZGUucmVlZFNvbG9tb25NdWx0aXBseShyb290LCAweDAyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWVkU29sb21vbkNvbXB1dGVSZW1haW5kZXIoZGF0YTogUmVhZG9ubHk8QXJyYXk8Ynl0ZT4+LCBkaXZpc29yOiBSZWFkb25seTxBcnJheTxieXRlPj4pOiBBcnJheTxieXRlPiB7XHJcbiAgICAgICAgbGV0IHJlc3VsdDogQXJyYXk8Ynl0ZT4gPSBkaXZpc29yLm1hcCgoXykgPT4gMCk7XHJcbiAgICAgICAgZm9yIChjb25zdCBiIG9mIGRhdGEpIHtcclxuICAgICAgICAgICAgY29uc3QgZmFjdG9yOiBieXRlID0gYiBeIChyZXN1bHQuc2hpZnQoKSBhcyBieXRlKTtcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMCk7XHJcbiAgICAgICAgICAgIGRpdmlzb3IuZm9yRWFjaCgoY29lZiwgaSkgPT4gKHJlc3VsdFtpXSBePSBRckNvZGUucmVlZFNvbG9tb25NdWx0aXBseShjb2VmLCBmYWN0b3IpKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVlZFNvbG9tb25NdWx0aXBseSh4OiBieXRlLCB5OiBieXRlKTogYnl0ZSB7XHJcbiAgICAgICAgaWYgKHggPj4+IDggIT0gMCB8fCB5ID4+PiA4ICE9IDApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0J5dGUgb3V0IG9mIHJhbmdlJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGxldCB6OiBpbnQgPSAwO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSA3OyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICB6ID0gKHogPDwgMSkgXiAoKHogPj4+IDcpICogMHgxMWQpO1xyXG4gICAgICAgICAgICB6IF49ICgoeSA+Pj4gaSkgJiAxKSAqIHg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGFzc2VydCh6ID4+PiA4ID09IDApO1xyXG4gICAgICAgIHJldHVybiB6IGFzIGJ5dGU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBmaW5kZXJQZW5hbHR5Q291bnRQYXR0ZXJucyhydW5IaXN0b3J5OiBSZWFkb25seTxBcnJheTxpbnQ+Pik6IGludCB7XHJcbiAgICAgICAgY29uc3QgbjogaW50ID0gcnVuSGlzdG9yeVsxXTtcclxuICAgICAgICBhc3NlcnQobiA8PSB0aGlzLnNpemUgKiAzKTtcclxuICAgICAgICBjb25zdCBjb3JlOiBib29sZWFuID1cclxuICAgICAgICAgICAgbiA+IDAgJiYgcnVuSGlzdG9yeVsyXSA9PSBuICYmIHJ1bkhpc3RvcnlbM10gPT0gbiAqIDMgJiYgcnVuSGlzdG9yeVs0XSA9PSBuICYmIHJ1bkhpc3RvcnlbNV0gPT0gbjtcclxuICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAoY29yZSAmJiBydW5IaXN0b3J5WzBdID49IG4gKiA0ICYmIHJ1bkhpc3RvcnlbNl0gPj0gbiA/IDEgOiAwKSArXHJcbiAgICAgICAgICAgIChjb3JlICYmIHJ1bkhpc3RvcnlbNl0gPj0gbiAqIDQgJiYgcnVuSGlzdG9yeVswXSA+PSBuID8gMSA6IDApXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGZpbmRlclBlbmFsdHlUZXJtaW5hdGVBbmRDb3VudChjdXJyZW50UnVuQ29sb3I6IGJvb2xlYW4sIGN1cnJlbnRSdW5MZW5ndGg6IGludCwgcnVuSGlzdG9yeTogQXJyYXk8aW50Pik6IGludCB7XHJcbiAgICAgICAgaWYgKGN1cnJlbnRSdW5Db2xvcikge1xyXG4gICAgICAgICAgICB0aGlzLmZpbmRlclBlbmFsdHlBZGRIaXN0b3J5KGN1cnJlbnRSdW5MZW5ndGgsIHJ1bkhpc3RvcnkpO1xyXG4gICAgICAgICAgICBjdXJyZW50UnVuTGVuZ3RoID0gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgY3VycmVudFJ1bkxlbmd0aCArPSB0aGlzLnNpemU7XHJcbiAgICAgICAgdGhpcy5maW5kZXJQZW5hbHR5QWRkSGlzdG9yeShjdXJyZW50UnVuTGVuZ3RoLCBydW5IaXN0b3J5KTtcclxuICAgICAgICByZXR1cm4gdGhpcy5maW5kZXJQZW5hbHR5Q291bnRQYXR0ZXJucyhydW5IaXN0b3J5KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGZpbmRlclBlbmFsdHlBZGRIaXN0b3J5KGN1cnJlbnRSdW5MZW5ndGg6IGludCwgcnVuSGlzdG9yeTogQXJyYXk8aW50Pik6IHZvaWQge1xyXG4gICAgICAgIGlmIChydW5IaXN0b3J5WzBdID09IDApIHtcclxuICAgICAgICAgICAgY3VycmVudFJ1bkxlbmd0aCArPSB0aGlzLnNpemU7XHJcbiAgICAgICAgfSAvLyBBZGQgbGlnaHQgYm9yZGVyIHRvIGluaXRpYWwgcnVuXHJcbiAgICAgICAgcnVuSGlzdG9yeS5wb3AoKTtcclxuICAgICAgICBydW5IaXN0b3J5LnVuc2hpZnQoY3VycmVudFJ1bkxlbmd0aCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBNSU5fVkVSU0lPTjogaW50ID0gMTtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgTUFYX1ZFUlNJT046IGludCA9IDQwO1xyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBFTkFMVFlfTjE6IGludCA9IDM7XHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBQRU5BTFRZX04yOiBpbnQgPSAzO1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUEVOQUxUWV9OMzogaW50ID0gNDA7XHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBQRU5BTFRZX040OiBpbnQgPSAxMDtcclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBFQ0NfQ09ERVdPUkRTX1BFUl9CTE9DSzogQXJyYXk8QXJyYXk8aW50Pj4gPSBbXHJcbiAgICAgICAgLy8gVmVyc2lvbjogKG5vdGUgdGhhdCBpbmRleCAwIGlzIGZvciBwYWRkaW5nLCBhbmQgaXMgc2V0IHRvIGFuIGlsbGVnYWwgdmFsdWUpXHJcbiAgICAgICAgLy8wLCAgMSwgIDIsICAzLCAgNCwgIDUsICA2LCAgNywgIDgsICA5LCAxMCwgMTEsIDEyLCAxMywgMTQsIDE1LCAxNiwgMTcsIDE4LCAxOSwgMjAsIDIxLCAyMiwgMjMsIDI0LCAyNSwgMjYsIDI3LCAyOCwgMjksIDMwLCAzMSwgMzIsIDMzLCAzNCwgMzUsIDM2LCAzNywgMzgsIDM5LCA0MCAgICBFcnJvciBjb3JyZWN0aW9uIGxldmVsXHJcbiAgICAgICAgW1xyXG4gICAgICAgICAgICAtMSwgNywgMTAsIDE1LCAyMCwgMjYsIDE4LCAyMCwgMjQsIDMwLCAxOCwgMjAsIDI0LCAyNiwgMzAsIDIyLCAyNCwgMjgsIDMwLCAyOCwgMjgsIDI4LCAyOCwgMzAsIDMwLCAyNiwgMjgsIDMwLCAzMCxcclxuICAgICAgICAgICAgMzAsIDMwLCAzMCwgMzAsIDMwLCAzMCwgMzAsIDMwLCAzMCwgMzAsIDMwLCAzMFxyXG4gICAgICAgIF0sIC8vIExvd1xyXG4gICAgICAgIFtcclxuICAgICAgICAgICAgLTEsIDEwLCAxNiwgMjYsIDE4LCAyNCwgMTYsIDE4LCAyMiwgMjIsIDI2LCAzMCwgMjIsIDIyLCAyNCwgMjQsIDI4LCAyOCwgMjYsIDI2LCAyNiwgMjYsIDI4LCAyOCwgMjgsIDI4LCAyOCwgMjgsXHJcbiAgICAgICAgICAgIDI4LCAyOCwgMjgsIDI4LCAyOCwgMjgsIDI4LCAyOCwgMjgsIDI4LCAyOCwgMjgsIDI4XHJcbiAgICAgICAgXSwgLy8gTWVkaXVtXHJcbiAgICAgICAgW1xyXG4gICAgICAgICAgICAtMSwgMTMsIDIyLCAxOCwgMjYsIDE4LCAyNCwgMTgsIDIyLCAyMCwgMjQsIDI4LCAyNiwgMjQsIDIwLCAzMCwgMjQsIDI4LCAyOCwgMjYsIDMwLCAyOCwgMzAsIDMwLCAzMCwgMzAsIDI4LCAzMCxcclxuICAgICAgICAgICAgMzAsIDMwLCAzMCwgMzAsIDMwLCAzMCwgMzAsIDMwLCAzMCwgMzAsIDMwLCAzMCwgMzBcclxuICAgICAgICBdLCAvLyBRdWFydGlsZVxyXG4gICAgICAgIFtcclxuICAgICAgICAgICAgLTEsIDE3LCAyOCwgMjIsIDE2LCAyMiwgMjgsIDI2LCAyNiwgMjQsIDI4LCAyNCwgMjgsIDIyLCAyNCwgMjQsIDMwLCAyOCwgMjgsIDI2LCAyOCwgMzAsIDI0LCAzMCwgMzAsIDMwLCAzMCwgMzAsXHJcbiAgICAgICAgICAgIDMwLCAzMCwgMzAsIDMwLCAzMCwgMzAsIDMwLCAzMCwgMzAsIDMwLCAzMCwgMzAsIDMwXHJcbiAgICAgICAgXSAvLyBIaWdoXHJcbiAgICBdO1xyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE5VTV9FUlJPUl9DT1JSRUNUSU9OX0JMT0NLUzogQXJyYXk8QXJyYXk8aW50Pj4gPSBbXHJcbiAgICAgICAgLy8gVmVyc2lvbjogKG5vdGUgdGhhdCBpbmRleCAwIGlzIGZvciBwYWRkaW5nLCBhbmQgaXMgc2V0IHRvIGFuIGlsbGVnYWwgdmFsdWUpXHJcbiAgICAgICAgLy8wLCAxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5LDEwLCAxMSwgMTIsIDEzLCAxNCwgMTUsIDE2LCAxNywgMTgsIDE5LCAyMCwgMjEsIDIyLCAyMywgMjQsIDI1LCAyNiwgMjcsIDI4LCAyOSwgMzAsIDMxLCAzMiwgMzMsIDM0LCAzNSwgMzYsIDM3LCAzOCwgMzksIDQwICAgIEVycm9yIGNvcnJlY3Rpb24gbGV2ZWxcclxuICAgICAgICBbXHJcbiAgICAgICAgICAgIC0xLCAxLCAxLCAxLCAxLCAxLCAyLCAyLCAyLCAyLCA0LCA0LCA0LCA0LCA0LCA2LCA2LCA2LCA2LCA3LCA4LCA4LCA5LCA5LCAxMCwgMTIsIDEyLCAxMiwgMTMsIDE0LCAxNSwgMTYsIDE3LCAxOCxcclxuICAgICAgICAgICAgMTksIDE5LCAyMCwgMjEsIDIyLCAyNCwgMjVcclxuICAgICAgICBdLCAvLyBMb3dcclxuICAgICAgICBbXHJcbiAgICAgICAgICAgIC0xLCAxLCAxLCAxLCAyLCAyLCA0LCA0LCA0LCA1LCA1LCA1LCA4LCA5LCA5LCAxMCwgMTAsIDExLCAxMywgMTQsIDE2LCAxNywgMTcsIDE4LCAyMCwgMjEsIDIzLCAyNSwgMjYsIDI4LCAyOSwgMzEsXHJcbiAgICAgICAgICAgIDMzLCAzNSwgMzcsIDM4LCA0MCwgNDMsIDQ1LCA0NywgNDlcclxuICAgICAgICBdLCAvLyBNZWRpdW1cclxuICAgICAgICBbXHJcbiAgICAgICAgICAgIC0xLCAxLCAxLCAyLCAyLCA0LCA0LCA2LCA2LCA4LCA4LCA4LCAxMCwgMTIsIDE2LCAxMiwgMTcsIDE2LCAxOCwgMjEsIDIwLCAyMywgMjMsIDI1LCAyNywgMjksIDM0LCAzNCwgMzUsIDM4LCA0MCxcclxuICAgICAgICAgICAgNDMsIDQ1LCA0OCwgNTEsIDUzLCA1NiwgNTksIDYyLCA2NSwgNjhcclxuICAgICAgICBdLCAvLyBRdWFydGlsZVxyXG4gICAgICAgIFtcclxuICAgICAgICAgICAgLTEsIDEsIDEsIDIsIDQsIDQsIDQsIDUsIDYsIDgsIDgsIDExLCAxMSwgMTYsIDE2LCAxOCwgMTYsIDE5LCAyMSwgMjUsIDI1LCAyNSwgMzQsIDMwLCAzMiwgMzUsIDM3LCA0MCwgNDIsIDQ1LCA0OCxcclxuICAgICAgICAgICAgNTEsIDU0LCA1NywgNjAsIDYzLCA2NiwgNzAsIDc0LCA3NywgODFcclxuICAgICAgICBdIC8vIEhpZ2hcclxuICAgIF07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFwcGVuZEJpdHModmFsOiBpbnQsIGxlbjogaW50LCBiYjogQXJyYXk8Yml0Pik6IHZvaWQge1xyXG4gICAgaWYgKGxlbiA8IDAgfHwgbGVuID4gMzEgfHwgdmFsID4+PiBsZW4gIT0gMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdWYWx1ZSBvdXQgb2YgcmFuZ2UnKTtcclxuICAgIH1cclxuICAgIGZvciAobGV0IGkgPSBsZW4gLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgIGJiLnB1c2goKHZhbCA+Pj4gaSkgJiAxKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0Qml0KHg6IGludCwgaTogaW50KTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gKCh4ID4+PiBpKSAmIDEpICE9IDA7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFzc2VydChjb25kOiBib29sZWFuKTogdm9pZCB7XHJcbiAgICBpZiAoIWNvbmQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Fzc2VydGlvbiBlcnJvcicpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBRclNlZ21lbnQge1xyXG4gICAgcHVibGljIHN0YXRpYyBtYWtlQnl0ZXMoZGF0YTogUmVhZG9ubHk8QXJyYXk8Ynl0ZT4+KTogUXJTZWdtZW50IHtcclxuICAgICAgICBsZXQgYmI6IEFycmF5PGJpdD4gPSBbXTtcclxuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgZGF0YSkge1xyXG4gICAgICAgICAgICBhcHBlbmRCaXRzKGIsIDgsIGJiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG5ldyBRclNlZ21lbnQoTW9kZS5CWVRFLCBkYXRhLmxlbmd0aCwgYmIpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgbWFrZU51bWVyaWMoZGlnaXRzOiBzdHJpbmcpOiBRclNlZ21lbnQge1xyXG4gICAgICAgIGlmICghUXJTZWdtZW50LmlzTnVtZXJpYyhkaWdpdHMpKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdTdHJpbmcgY29udGFpbnMgbm9uLW51bWVyaWMgY2hhcmFjdGVycycpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBsZXQgYmI6IEFycmF5PGJpdD4gPSBbXTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRpZ2l0cy5sZW5ndGg7KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG46IGludCA9IE1hdGgubWluKGRpZ2l0cy5sZW5ndGggLSBpLCAzKTtcclxuICAgICAgICAgICAgYXBwZW5kQml0cyhwYXJzZUludChkaWdpdHMuc3Vic3RyaW5nKGksIGkgKyBuKSwgMTApLCBuICogMyArIDEsIGJiKTtcclxuICAgICAgICAgICAgaSArPSBuO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbmV3IFFyU2VnbWVudChNb2RlLk5VTUVSSUMsIGRpZ2l0cy5sZW5ndGgsIGJiKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIG1ha2VBbHBoYW51bWVyaWModGV4dDogc3RyaW5nKTogUXJTZWdtZW50IHtcclxuICAgICAgICBpZiAoIVFyU2VnbWVudC5pc0FscGhhbnVtZXJpYyh0ZXh0KSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignU3RyaW5nIGNvbnRhaW5zIHVuZW5jb2RhYmxlIGNoYXJhY3RlcnMgaW4gYWxwaGFudW1lcmljIG1vZGUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IGJiOiBBcnJheTxiaXQ+ID0gW107XHJcbiAgICAgICAgbGV0IGk6IGludDtcclxuICAgICAgICBmb3IgKGkgPSAwOyBpICsgMiA8PSB0ZXh0Lmxlbmd0aDsgaSArPSAyKSB7XHJcbiAgICAgICAgICAgIGxldCB0ZW1wOiBpbnQgPSBRclNlZ21lbnQuQUxQSEFOVU1FUklDX0NIQVJTRVQuaW5kZXhPZih0ZXh0LmNoYXJBdChpKSkgKiA0NTtcclxuICAgICAgICAgICAgdGVtcCArPSBRclNlZ21lbnQuQUxQSEFOVU1FUklDX0NIQVJTRVQuaW5kZXhPZih0ZXh0LmNoYXJBdChpICsgMSkpO1xyXG4gICAgICAgICAgICBhcHBlbmRCaXRzKHRlbXAsIDExLCBiYik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChpIDwgdGV4dC5sZW5ndGgpIHtcclxuICAgICAgICAgICAgYXBwZW5kQml0cyhRclNlZ21lbnQuQUxQSEFOVU1FUklDX0NIQVJTRVQuaW5kZXhPZih0ZXh0LmNoYXJBdChpKSksIDYsIGJiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG5ldyBRclNlZ21lbnQoTW9kZS5BTFBIQU5VTUVSSUMsIHRleHQubGVuZ3RoLCBiYik7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBtYWtlU2VnbWVudHModGV4dDogc3RyaW5nKTogQXJyYXk8UXJTZWdtZW50PiB7XHJcbiAgICAgICAgaWYgKHRleHQgPT0gJycpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoUXJTZWdtZW50LmlzTnVtZXJpYyh0ZXh0KSkge1xyXG4gICAgICAgICAgICByZXR1cm4gW1FyU2VnbWVudC5tYWtlTnVtZXJpYyh0ZXh0KV07XHJcbiAgICAgICAgfSBlbHNlIGlmIChRclNlZ21lbnQuaXNBbHBoYW51bWVyaWModGV4dCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFtRclNlZ21lbnQubWFrZUFscGhhbnVtZXJpYyh0ZXh0KV07XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmV0dXJuIFtRclNlZ21lbnQubWFrZUJ5dGVzKFFyU2VnbWVudC50b1V0ZjhCeXRlQXJyYXkodGV4dCkpXTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBtYWtlRWNpKGFzc2lnblZhbDogaW50KTogUXJTZWdtZW50IHtcclxuICAgICAgICBsZXQgYmI6IEFycmF5PGJpdD4gPSBbXTtcclxuICAgICAgICBpZiAoYXNzaWduVmFsIDwgMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignRUNJIGFzc2lnbm1lbnQgdmFsdWUgb3V0IG9mIHJhbmdlJyk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChhc3NpZ25WYWwgPCAxIDw8IDcpIHtcclxuICAgICAgICAgICAgYXBwZW5kQml0cyhhc3NpZ25WYWwsIDgsIGJiKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGFzc2lnblZhbCA8IDEgPDwgMTQpIHtcclxuICAgICAgICAgICAgYXBwZW5kQml0cygwYjEwLCAyLCBiYik7XHJcbiAgICAgICAgICAgIGFwcGVuZEJpdHMoYXNzaWduVmFsLCAxNCwgYmIpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoYXNzaWduVmFsIDwgMTAwMDAwMCkge1xyXG4gICAgICAgICAgICBhcHBlbmRCaXRzKDBiMTEwLCAzLCBiYik7XHJcbiAgICAgICAgICAgIGFwcGVuZEJpdHMoYXNzaWduVmFsLCAyMSwgYmIpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdFQ0kgYXNzaWdubWVudCB2YWx1ZSBvdXQgb2YgcmFuZ2UnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG5ldyBRclNlZ21lbnQoTW9kZS5FQ0ksIDAsIGJiKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzTnVtZXJpYyh0ZXh0OiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gUXJTZWdtZW50Lk5VTUVSSUNfUkVHRVgudGVzdCh0ZXh0KTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzQWxwaGFudW1lcmljKHRleHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiBRclNlZ21lbnQuQUxQSEFOVU1FUklDX1JFR0VYLnRlc3QodGV4dCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBtb2RlOiBNb2RlLCBwdWJsaWMgcmVhZG9ubHkgbnVtQ2hhcnM6IGludCwgcHJpdmF0ZSByZWFkb25seSBiaXREYXRhOiBBcnJheTxiaXQ+KSB7XHJcbiAgICAgICAgaWYgKG51bUNoYXJzIDwgMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignSW52YWxpZCBhcmd1bWVudCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmJpdERhdGEgPSBiaXREYXRhLnNsaWNlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGdldERhdGEoKTogQXJyYXk8Yml0PiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuYml0RGF0YS5zbGljZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0VG90YWxCaXRzKHNlZ3M6IFJlYWRvbmx5PEFycmF5PFFyU2VnbWVudD4+LCB2ZXJzaW9uOiBpbnQpOiBudW1iZXIge1xyXG4gICAgICAgIGxldCByZXN1bHQ6IG51bWJlciA9IDA7XHJcbiAgICAgICAgZm9yIChjb25zdCBzZWcgb2Ygc2Vncykge1xyXG4gICAgICAgICAgICBjb25zdCBjY2JpdHM6IGludCA9IHNlZy5tb2RlLm51bUNoYXJDb3VudEJpdHModmVyc2lvbik7XHJcbiAgICAgICAgICAgIGlmIChzZWcubnVtQ2hhcnMgPj0gMSA8PCBjY2JpdHMpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBJbmZpbml0eTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXN1bHQgKz0gNCArIGNjYml0cyArIHNlZy5iaXREYXRhLmxlbmd0aDtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyB0b1V0ZjhCeXRlQXJyYXkoc3RyOiBzdHJpbmcpOiBBcnJheTxieXRlPiB7XHJcbiAgICAgICAgc3RyID0gZW5jb2RlVVJJKHN0cik7XHJcbiAgICAgICAgbGV0IHJlc3VsdDogQXJyYXk8Ynl0ZT4gPSBbXTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAoc3RyLmNoYXJBdChpKSAhPSAnJScpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKHBhcnNlSW50KHN0ci5zdWJzdHJpbmcoaSArIDEsIGkgKyAzKSwgMTYpKTtcclxuICAgICAgICAgICAgICAgIGkgKz0gMjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE5VTUVSSUNfUkVHRVg6IFJlZ0V4cCA9IC9eWzAtOV0qJC87XHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBBTFBIQU5VTUVSSUNfUkVHRVg6IFJlZ0V4cCA9IC9eW0EtWjAtOSAkJSorLlxcLzotXSokLztcclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEFMUEhBTlVNRVJJQ19DSEFSU0VUOiBzdHJpbmcgPSAnMDEyMzQ1Njc4OUFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaICQlKistLi86JztcclxufVxyXG5cclxuY2xhc3MgRWNjIHtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgTE9XID0gbmV3IEVjYygwLCAxKTsgLy8gVGhlIFFSIENvZGUgY2FuIHRvbGVyYXRlIGFib3V0ICA3JSBlcnJvbmVvdXMgY29kZXdvcmRzXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IE1FRElVTSA9IG5ldyBFY2MoMSwgMCk7IC8vIFRoZSBRUiBDb2RlIGNhbiB0b2xlcmF0ZSBhYm91dCAxNSUgZXJyb25lb3VzIGNvZGV3b3Jkc1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBRVUFSVElMRSA9IG5ldyBFY2MoMiwgMyk7IC8vIFRoZSBRUiBDb2RlIGNhbiB0b2xlcmF0ZSBhYm91dCAyNSUgZXJyb25lb3VzIGNvZGV3b3Jkc1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBISUdIID0gbmV3IEVjYygzLCAyKTsgLy8gVGhlIFFSIENvZGUgY2FuIHRvbGVyYXRlIGFib3V0IDMwJSBlcnJvbmVvdXMgY29kZXdvcmRzXHJcblxyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBsb3cgPSB0aGlzLkxPV1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBtZWRpdW0gPSB0aGlzLk1FRElVTVxyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBxdWFydGlsZSA9IHRoaXMuUVVBUlRJTEVcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgaGlnaCA9IHRoaXMuSElHSFxyXG5cclxuICAgIHByaXZhdGUgY29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IG9yZGluYWw6IGludCwgcHVibGljIHJlYWRvbmx5IGZvcm1hdEJpdHM6IGludCkge1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBNb2RlIHtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgTlVNRVJJQyA9IG5ldyBNb2RlKDB4MSwgWzEwLCAxMiwgMTRdKTtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgQUxQSEFOVU1FUklDID0gbmV3IE1vZGUoMHgyLCBbOSwgMTEsIDEzXSk7XHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEJZVEUgPSBuZXcgTW9kZSgweDQsIFs4LCAxNiwgMTZdKTtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgS0FOSkkgPSBuZXcgTW9kZSgweDgsIFs4LCAxMCwgMTJdKTtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgRUNJID0gbmV3IE1vZGUoMHg3LCBbMCwgMCwgMF0pO1xyXG5cclxuICAgIHByaXZhdGUgY29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IG1vZGVCaXRzOiBpbnQsIHByaXZhdGUgcmVhZG9ubHkgbnVtQml0c0NoYXJDb3VudDogW2ludCwgaW50LCBpbnRdKSB7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIG51bUNoYXJDb3VudEJpdHModmVyOiBpbnQpOiBpbnQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLm51bUJpdHNDaGFyQ291bnRbTWF0aC5mbG9vcigodmVyICsgNykgLyAxNyldO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQge1FyQ29kZSwgRWNjfTtcclxuIl19