
export function toChineseNum(num: number): string {
    const chnNumChar = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    const chnUnitSection = ["", "万", "亿", "万亿", "亿亿"];
    const chnUnitChar = ["", "十", "百", "千"];

    const sectionToChinese = (section: number) => {
        let strIns = '', chnStr = '';
        let unitPos = 0;
        let zero = true;
        while (section > 0) {
            const v = section % 10;
            if (v === 0) {
                if (!zero) {
                    zero = true;
                    chnStr = chnNumChar[v] + chnStr;
                }
            } else {
                zero = false;
                strIns = chnNumChar[v];
                strIns += chnUnitChar[unitPos];
                chnStr = strIns + chnStr;
            }
            unitPos++;
            section = Math.floor(section / 10);
        }
        return chnStr;
    }

    let unitPos = 0;
    let strIns = '', chnStr = '';
    let needZero = false;

    if (num === 0) return chnNumChar[0];

    while (num > 0) {
        const section = num % 10000;
        if (needZero) {
            chnStr = chnNumChar[0] + chnStr;
        }
        strIns = sectionToChinese(section);
        strIns += (section !== 0) ? chnUnitSection[unitPos] : chnUnitSection[0];
        chnStr = strIns + chnStr;
        needZero = (section < 1000) && (section > 0);
        num = Math.floor(num / 10000);
        unitPos++;
    }

    // Fix: "一十" -> "十" logic if needed, but standard is "一十". 
    // Usually for 10-19 we prefer "十" instead of "一十" at start context, but algorithm typically gives "一十".
    // Simple fix for 10-19:
    if (chnStr.startsWith('一十')) {
        chnStr = chnStr.substring(1);
    }
    return chnStr;
}

export function formatNumber(template: string, index: number): string {
    // Default fallback
    if (!template || template === '{}') return `${index}`;

    // Regex for {n}, {n:00}, {n:zh}
    return template.replace(/{n(:([^}]+))?}/g, (_match, _, format) => {
        if (!format) return String(index);

        if (format === 'zh') {
            return toChineseNum(index);
        }

        // Zero padding like 00, 000
        if (/^0+$/.test(format)) {
            return String(index).padStart(format.length, '0');
        }

        return String(index);
    });
}
